import type { Env } from './types';
import { createSession, destroySession } from './session';
import { upsertUser } from './db';
import { errorResponse, getCookie, sessionCookie } from './utils';

const DISCORD_AUTH_URL  = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL    = 'https://discord.com/api/users/@me';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATE_COOKIE_TTL    = 600; // 10 minutes for CSRF state

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/auth/login')    return handleLogin(request, env);
  if (url.pathname === '/auth/callback') return handleCallback(request, env);
  if (url.pathname === '/auth/logout')   return handleLogout(request, env);

  return errorResponse('Not found', 404);
}

// ── /auth/login ────────────────────────────────────────────────────────

function handleLogin(request: Request, env: Env): Response {
  const url     = new URL(request.url);
  const rawBack = url.searchParams.get('returnTo') || '/';
  // Only allow relative paths to prevent open-redirect
  const returnTo = rawBack.startsWith('/') ? rawBack : '/';

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id:     env.DISCORD_CLIENT_ID,
    redirect_uri:  env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
    state,
  });
  const headers = new Headers({ Location: `${DISCORD_AUTH_URL}?${params}` });
  headers.append('Set-Cookie', `__discord_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${STATE_COOKIE_TTL}`);
  headers.append('Set-Cookie', `__return_to=${encodeURIComponent(returnTo)}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${STATE_COOKIE_TTL}`);
  return new Response(null, { status: 302, headers });
}

// ── /auth/callback ─────────────────────────────────────────────────────

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state');
  const stored = getCookie(request, '__discord_state');
  const rawBack = decodeURIComponent(getCookie(request, '__return_to') || '/');
  const returnTo = rawBack.startsWith('/') ? rawBack : '/';

  // Clear the CSRF state cookie regardless of outcome
  const clearStateCookie  = `__discord_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`;
  const clearReturnCookie = `__return_to=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`;

  if (!code || !state || state !== stored) {
    const errHeaders = new Headers({ Location: returnTo + (returnTo.includes('?') ? '&' : '?') + 'auth=error' });
    errHeaders.append('Set-Cookie', clearStateCookie);
    errHeaders.append('Set-Cookie', clearReturnCookie);
    return new Response(null, { status: 302, headers: errHeaders });
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenResp = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  env.DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenResp.ok) throw new Error('token exchange failed');
    const tokenData = await tokenResp.json() as { access_token: string };
    accessToken = tokenData.access_token;
  } catch {
    const errHeaders = new Headers({ Location: returnTo + (returnTo.includes('?') ? '&' : '?') + 'auth=error' });
    errHeaders.append('Set-Cookie', clearStateCookie);
    errHeaders.append('Set-Cookie', clearReturnCookie);
    return new Response(null, { status: 302, headers: errHeaders });
  }

  // Fetch Discord user info
  let discordId: string, username: string, avatar: string | null;
  try {
    const meResp = await fetch(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meResp.ok) throw new Error('me request failed');
    const me = await meResp.json() as { id: string; username: string; global_name?: string; avatar?: string };
    discordId = me.id;
    username  = me.global_name ?? me.username;
    avatar    = me.avatar ?? null;
  } catch {
    const errHeaders = new Headers({ Location: returnTo + (returnTo.includes('?') ? '&' : '?') + 'auth=error' });
    errHeaders.append('Set-Cookie', clearStateCookie);
    errHeaders.append('Set-Cookie', clearReturnCookie);
    return new Response(null, { status: 302, headers: errHeaders });
  }

  // Upsert user row, create session
  const userId = await upsertUser(env, discordId, username, avatar);
  const token  = await createSession(env, { userId, discordId, username, avatar });

  const successUrl = returnTo + (returnTo.includes('?') ? '&' : '?') + 'auth=success';
  const headers = new Headers({ Location: successUrl });
  headers.append('Set-Cookie', clearStateCookie);
  headers.append('Set-Cookie', clearReturnCookie);
  headers.append('Set-Cookie', sessionCookie(token, SESSION_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

// ── /auth/logout ───────────────────────────────────────────────────────

async function handleLogout(request: Request, env: Env): Promise<Response> {
  await destroySession(env, request);
  return new Response(null, {
    status: 200,
    headers: {
      'Set-Cookie': '__session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
      'Content-Type': 'application/json',
    },
  });
}
