import type { Env, CharacterRow, PutCharacterBody, MoogleProgressRow, PutMoogleBody, PutCollectCacheBody, ArtifactProgressRow, PutArtifactBody } from './types';

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
            portrait_url, avatar_url, data, updated_at,
            lodestone_title, lodestone_fc, lodestone_class,
            lodestone_class_level, lodestone_classes
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
            portrait_url, avatar_url, data, updated_at,
            lodestone_title, lodestone_fc, lodestone_class,
            lodestone_class_level, lodestone_classes
     FROM tracker_saves
     WHERE user_id = ? AND lodestone_id = ?`
  ).bind(userId, lodestoneId).first<CharacterRow>();
}

const MAX_CHARACTERS_PER_USER = 20;

/**
 * Returns the number of existing character rows for a user.
 * Used to enforce the per-user character cap before inserting a new row.
 */
export async function countCharacters(env: Env, userId: number): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tracker_saves WHERE user_id = ?'
  ).bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}

export { MAX_CHARACTERS_PER_USER };

/** Upsert a character save (create or overwrite). */
export async function putCharacter(
  env: Env,
  userId: number,
  lodestoneId: string,
  body: PutCharacterBody,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tracker_saves
       (user_id, lodestone_id, character_name, character_world, label, portrait_url, avatar_url,
        lodestone_title, lodestone_fc, lodestone_class, lodestone_class_level, lodestone_classes,
        data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lodestone_id) DO UPDATE SET
       character_name        = excluded.character_name,
       character_world       = excluded.character_world,
       label                 = COALESCE(excluded.label, tracker_saves.label),
       portrait_url          = COALESCE(excluded.portrait_url, tracker_saves.portrait_url),
       avatar_url            = COALESCE(excluded.avatar_url, tracker_saves.avatar_url),
       lodestone_title       = COALESCE(excluded.lodestone_title, tracker_saves.lodestone_title),
       lodestone_fc          = COALESCE(excluded.lodestone_fc, tracker_saves.lodestone_fc),
       lodestone_class       = COALESCE(excluded.lodestone_class, tracker_saves.lodestone_class),
       lodestone_class_level = COALESCE(excluded.lodestone_class_level, tracker_saves.lodestone_class_level),
       lodestone_classes     = COALESCE(excluded.lodestone_classes, tracker_saves.lodestone_classes),
       data                  = excluded.data,
       updated_at            = datetime('now')`
  ).bind(
    userId,
    lodestoneId,
    body.characterName,
    body.characterWorld ?? null,
    body.label ?? null,
    body.portraitUrl ?? null,
    body.avatarUrl ?? null,
    body.lodestoneTitle ?? null,
    body.lodestoneFC ?? null,
    body.lodestoneClass ?? null,
    body.lodestoneClassLevel ?? null,
    body.lodestoneClasses ?? null,
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

// ── Moogle progress ────────────────────────────────────────────────────

/**
 * Fetch moogle progress for a specific character.
 * If no row exists for the given lodestoneId, falls back to lodestone_id = ''
 * (account-level save) so pre-migration data and no-character sessions still load.
 */
export async function getMoogleProgress(
  env: Env,
  userId: number,
  lodestoneId: string,
  eventKey: string,
): Promise<MoogleProgressRow | null> {
  const row = await env.DB.prepare(
    `SELECT lodestone_id, event_key, wishlist, tomes_current, weekly_objectives,
            standard_objectives, minimog_challenges, ultimog_challenges, updated_at
     FROM moogle_progress
     WHERE user_id = ? AND lodestone_id = ? AND event_key = ?`
  ).bind(userId, lodestoneId, eventKey).first<MoogleProgressRow>();

  if (row) return row;

  // Fallback: if a specific character was requested but no row found,
  // try the account-level slot (lodestone_id = ''). Covers migrated data
  // and users who haven't linked a character yet.
  if (lodestoneId !== '') {
    return env.DB.prepare(
      `SELECT lodestone_id, event_key, wishlist, tomes_current, weekly_objectives,
              standard_objectives, minimog_challenges, ultimog_challenges, updated_at
       FROM moogle_progress
       WHERE user_id = ? AND lodestone_id = '' AND event_key = ?`
    ).bind(userId, eventKey).first<MoogleProgressRow>();
  }

  return null;
}

export async function putMoogleProgress(
  env: Env,
  userId: number,
  eventKey: string,
  body: PutMoogleBody,
): Promise<void> {
  const lodestoneId = body.lodestone_id ?? '';
  await env.DB.prepare(
    `INSERT INTO moogle_progress
       (user_id, lodestone_id, event_key, wishlist, tomes_current, weekly_objectives,
        standard_objectives, minimog_challenges, ultimog_challenges, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lodestone_id, event_key) DO UPDATE SET
       wishlist            = excluded.wishlist,
       tomes_current       = excluded.tomes_current,
       weekly_objectives   = excluded.weekly_objectives,
       standard_objectives = excluded.standard_objectives,
       minimog_challenges  = excluded.minimog_challenges,
       ultimog_challenges  = excluded.ultimog_challenges,
       updated_at          = datetime('now')`
  ).bind(
    userId, lodestoneId, eventKey,
    body.wishlist, body.tomes_current,
    body.weekly_objectives, body.standard_objectives,
    body.minimog_challenges, body.ultimog_challenges,
  ).run();
}

// ── FFXIV Collect cache ────────────────────────────────────────────────

export async function getCollectCache(
  env: Env,
  userId: number,
  lodestoneId: string,
): Promise<{ cache: string | null; cache_dt: string | null; synced_at: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT ffxiv_cache, ffxiv_cache_dt, ffxiv_collect_synced_at
     FROM tracker_saves
     WHERE user_id = ? AND lodestone_id = ?`
  ).bind(userId, lodestoneId).first<{
    ffxiv_cache: string | null;
    ffxiv_cache_dt: string | null;
    ffxiv_collect_synced_at: string | null;
  }>();
  if (!row) return null;
  return { cache: row.ffxiv_cache, cache_dt: row.ffxiv_cache_dt, synced_at: row.ffxiv_collect_synced_at };
}

export async function putCollectCache(
  env: Env,
  userId: number,
  lodestoneId: string,
  body: PutCollectCacheBody,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE tracker_saves SET
       ffxiv_cache             = ?,
       ffxiv_cache_dt          = datetime('now'),
       ffxiv_collect_synced_at = CASE WHEN ? THEN datetime('now') ELSE ffxiv_collect_synced_at END
     WHERE user_id = ? AND lodestone_id = ?`
  ).bind(body.cache, body.force_synced ? 1 : 0, userId, lodestoneId).run();
}

// ── Artifact progress ────────────────────────────────────────────────


/**
 * Fetch artifact progress for a specific character.
 * Falls back to lodestone_id = '' (account-level save) like moogle.
 * Returns 'not-modified when If-Modified-Since matches updated_at.
 */
export async function getArtifactProgress(
  env: Env,
  userId: number,
  lodestoneId: string,
  expansionKey: string,
): Promise<ArtifactProgressRow | null> {
  const row = await env.DB.prepare(
    `SELECT lodestone_id, expansion_key, tracked_jobs, have, steps, reqs, content_hash, updated_at
     FROM artifact_progress
     WHERE user_id = ? AND lodestone_id = ? AND expansion_key = ?`
  ).bind(userId, lodestoneId, expansionKey).first<ArtifactProgressRow>();

  if (row) return row;

  if (lodestoneId !== '') {
    return env.DB.prepare(
      `SELECT lodestone_id, expansion_key, tracked_jobs, have, steps, reqs, content_hash, updated_at
       FROM artifact_progress
       WHERE user_id = ? AND lodestone_id = '' AND expansion_key = ?`
    ).bind(userId, expansionKey).first<ArtifactProgressRow>();
  }

  return null;
}

/**
 * Upsert artifact progress. Skips the write when content_hash matches
 * the stored row (client soft-cache no-op guard). Returns true when a
 * write actually happened.
 */
export async function putArtifactProgress(
  env: Env,
  userId: number,
  expansionKey: string,
  body: PutArtifactBody,
  contentHash: string,
): Promise<boolean> {
  const lodestoneId = body.lodestone_id ?? '';
  if (contentHash) {
    const cur = await env.DB.prepare(
      'SELECT content_hash FROM artifact_progress WHERE user_id = ? AND lodestone_id = ? AND expansion_key = ?'
    ).bind(userId, lodestoneId, expansionKey).first<{ content_hash: string }>();
    if (cur && cur.content_hash === contentHash) return false;
  }
  await env.DB.prepare(
    `INSERT INTO artifact_progress
       (user_id, lodestone_id, expansion_key, tracked_jobs, have, steps, reqs, content_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lodestone_id, expansion_key) DO UPDATE SET
       tracked_jobs = excluded.tracked_jobs,
       have         = excluded.have,
       steps        = excluded.steps,
       reqs         = excluded.reqs,
       content_hash = excluded.content_hash,
       updated_at   = datetime('now')`
  ).bind(
    userId, lodestoneId, expansionKey,
    body.tracked_jobs, body.have, body.steps, body.reqs, contentHash || '',
  ).run();
  return true;
}

// ── Character saves ────────────────────────────────────────────────────

/** Delete a character save. Returns true if a row was actually deleted. */export async function deleteCharacter(
  env: Env,
  userId: number,
  lodestoneId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM tracker_saves WHERE user_id = ? AND lodestone_id = ?'
  ).bind(userId, lodestoneId).run();
  return (result.meta.changes ?? 0) > 0;
}
