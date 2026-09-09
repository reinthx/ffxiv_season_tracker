import type { Env, Session } from './types';
import { getCookie } from './utils';

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export async function createSession(env: Env, data: Omit<Session, 'expiresAt'>): Promise<string> {
  const token     = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, discord_id, username, avatar, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(token, data.userId, data.discordId, data.username, data.avatar, expiresAt).run();
  return token;
}

export async function getSession(env: Env, request: Request): Promise<Session | null> {
  const token = getCookie(request, '__session');
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT user_id, discord_id, username, avatar, expires_at
     FROM sessions WHERE token = ? AND expires_at > ?`
  ).bind(token, now).first<{
    user_id:    number;
    discord_id: string;
    username:   string;
    avatar:     string | null;
    expires_at: number;
  }>();
  if (!row) return null;
  return {
    userId:    row.user_id,
    discordId: row.discord_id,
    username:  row.username,
    avatar:    row.avatar,
    expiresAt: row.expires_at * 1000,
  };
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = getCookie(request, '__session');
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}
