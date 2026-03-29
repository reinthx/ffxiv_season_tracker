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

function handleLogin(_request: Request, env: Env): Response {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id:     env.DISCORD_CLIENT_ID,
    redirect_uri:  env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location:   `${DISCORD_AUTH_URL}?${params}`,
      'Set-Cookie': `__discord_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${STATE_COOKIE_TTL}`,
    },
  });
}

// ── /auth/callback ─────────────────────────────────────────────────────

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state');
  const stored = getCookie(request, '__discord_state');

  // Clear the CSRF state cookie regardless of outcome
  const clearStateCookie = `__discord_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0`;

  if (!code || !state || state !== stored) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth=error', 'Set-Cookie': clearStateCookie },
    });
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
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth=error', 'Set-Cookie': clearStateCookie },
    });
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
    return new Response(null, {
      status: 302,
      headers: { Location: '/?auth=error', 'Set-Cookie': clearStateCookie },
    });
  }

  // Upsert user row, create session
  const userId = await upsertUser(env, discordId, username, avatar);
  const token  = await createSession(env, { userId, discordId, username, avatar });

  const headers = new Headers({ Location: '/?auth=success' });
  headers.append('Set-Cookie', clearStateCookie);
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
