import type { Env, Session } from './types';
import { getCookie } from './utils';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function sessionKey(token: string): string {
  return `session:${token}`;
}

export async function createSession(env: Env, data: Omit<Session, 'expiresAt'>): Promise<string> {
  const token = crypto.randomUUID();
  const session: Session = {
    ...data,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await env.SESSIONS.put(sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function getSession(env: Env, request: Request): Promise<Session | null> {
  const token = getCookie(request, '__session');
  if (!token) return null;
  const raw = await env.SESSIONS.get(sessionKey(token));
  if (!raw) return null;
  try {
    const session: Session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      await env.SESSIONS.delete(sessionKey(token));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = getCookie(request, '__session');
  if (token) await env.SESSIONS.delete(sessionKey(token));
}
