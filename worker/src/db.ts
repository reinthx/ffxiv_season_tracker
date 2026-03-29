import type { Env, CharacterRow, PutCharacterBody } from './types';

// ── Users ──────────────────────────────────────────────────────────────

/**
 * Upserts a Discord user. Uses ON CONFLICT DO UPDATE so the auto-increment
 * id (and all foreign key references) are never replaced/reset.
 * Returns the internal user id.
 */
export async function upsertUser(
  env: Env,
  discordId: string,
  username: string,
  avatar: string | null,
): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO users (discord_id, username, avatar)
     VALUES (?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       username   = excluded.username,
       avatar     = excluded.avatar,
       last_login = datetime('now')`
  ).bind(discordId, username, avatar).run();

  const row = await env.DB.prepare(
    'SELECT id FROM users WHERE discord_id = ?'
  ).bind(discordId).first<{ id: number }>();

  return row!.id;
}

// ── Character saves ────────────────────────────────────────────────────

/** All characters for a user, newest first. */
export async function getCharacters(env: Env, userId: number): Promise<CharacterRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, lodestone_id, character_name, character_world, label,
            portrait_url, avatar_url, data, updated_at
     FROM tracker_saves
     WHERE user_id = ?
     ORDER BY updated_at DESC`
  ).bind(userId).all<CharacterRow>();
  return result.results;
}

/** Single character by lodestone_id, or null. */
export async function getCharacter(
  env: Env,
  userId: number,
  lodestoneId: string,
): Promise<CharacterRow | null> {
  return env.DB.prepare(
    `SELECT id, lodestone_id, character_name, character_world, label,
            portrait_url, avatar_url, data, updated_at
     FROM tracker_saves
     WHERE user_id = ? AND lodestone_id = ?`
  ).bind(userId, lodestoneId).first<CharacterRow>();
}

/** Upsert a character save (create or overwrite). */
export async function putCharacter(
  env: Env,
  userId: number,
  lodestoneId: string,
  body: PutCharacterBody,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tracker_saves
       (user_id, lodestone_id, character_name, character_world, label, portrait_url, avatar_url, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lodestone_id) DO UPDATE SET
       character_name  = excluded.character_name,
       character_world = excluded.character_world,
       label           = COALESCE(excluded.label, tracker_saves.label),
       portrait_url    = COALESCE(excluded.portrait_url, tracker_saves.portrait_url),
       avatar_url      = COALESCE(excluded.avatar_url, tracker_saves.avatar_url),
       data            = excluded.data,
       updated_at      = datetime('now')`
  ).bind(
    userId,
    lodestoneId,
    body.characterName,
    body.characterWorld ?? null,
    body.label ?? null,
    body.portraitUrl ?? null,
    body.avatarUrl ?? null,
    body.data,
  ).run();
}

/** Update only the label for a character. */
export async function patchCharacterLabel(
  env: Env,
  userId: number,
  lodestoneId: string,
  label: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE tracker_saves SET label = ?, updated_at = datetime('now')
     WHERE user_id = ? AND lodestone_id = ?`
  ).bind(label, userId, lodestoneId).run();
  return (result.meta.changes ?? 0) > 0;
}

/** Delete a character save. Returns true if a row was actually deleted. */
export async function deleteCharacter(
  env: Env,
  userId: number,
  lodestoneId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM tracker_saves WHERE user_id = ? AND lodestone_id = ?'
  ).bind(userId, lodestoneId).run();
  return (result.meta.changes ?? 0) > 0;
}
