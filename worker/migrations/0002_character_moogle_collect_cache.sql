-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Migration 0002
--  1. Bind moogle_progress to a character (lodestone_id) rather than
--     just an account. Existing rows migrated to lodestone_id = ''
--     (account-level fallback) so no data is lost.
--  2. Add FFXIV Collect owned-ID cache columns to tracker_saves so
--     the cache survives across devices for Discord users.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 1. Recreate moogle_progress with lodestone_id in PK ──────────────

CREATE TABLE moogle_progress_new (
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lodestone_id          TEXT    NOT NULL DEFAULT '',
  event_key             TEXT    NOT NULL,
  wishlist              TEXT    NOT NULL DEFAULT '{}',
  tomes_current         INTEGER NOT NULL DEFAULT 0,
  weekly_objectives     TEXT    NOT NULL DEFAULT '{}',
  standard_objectives   TEXT    NOT NULL DEFAULT '{}',
  minimog_challenges    TEXT    NOT NULL DEFAULT '{}',
  ultimog_challenges    TEXT    NOT NULL DEFAULT '{}',
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, lodestone_id, event_key)
);

-- Migrate existing rows — account-level saves land in lodestone_id = ''
INSERT INTO moogle_progress_new
  (user_id, lodestone_id, event_key, wishlist, tomes_current,
   weekly_objectives, standard_objectives, minimog_challenges,
   ultimog_challenges, updated_at)
SELECT
  user_id, '', event_key, wishlist, tomes_current,
  weekly_objectives, standard_objectives, minimog_challenges,
  ultimog_challenges, updated_at
FROM moogle_progress;

DROP TABLE moogle_progress;
ALTER TABLE moogle_progress_new RENAME TO moogle_progress;

-- ── 2. Add FFXIV Collect cache columns to tracker_saves ──────────────
--
--  ffxiv_cache:             JSON blob  { mounts:[...], minions:[...], ... }
--                           Only the 'ids' arrays for the 7 categories we need.
--  ffxiv_cache_dt:          When the cache was written (our side).
--  ffxiv_collect_synced_at: When latest=true was last requested (rate-limit anchor).
--                           NULL = never force-synced.

ALTER TABLE tracker_saves ADD COLUMN ffxiv_cache             TEXT;
ALTER TABLE tracker_saves ADD COLUMN ffxiv_cache_dt          TEXT;
ALTER TABLE tracker_saves ADD COLUMN ffxiv_collect_synced_at TEXT;
