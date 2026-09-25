-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Migration 0005 — artifact_progress (Artifact Hub / relic grind)
--  One save per user × character × expansion. JSON blobs keep the
--  schema stable as steps/jobs change (same pattern as moogle_progress).
--
--  lodestone_id: '' = account-level fallback (mirrors migration 0002).
--  tracked_jobs: JSON array of job slugs, e.g. '["PLD","SAM"]'.
--  have:         JSON map of item stockpiles, e.g. '{"timeworn_artifact":14}'.
--  steps:        JSON map "JOB:n" -> state
--                ('tracked' | 'done' | 'collect-owned' | 'ignored').
--  content_hash: djb2 of the canonical payload — lets the worker skip
--                the UPDATE when the client re-sends identical data
--                (soft-cache no-op guard).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS artifact_progress (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lodestone_id  TEXT    NOT NULL DEFAULT '',
  expansion_key TEXT    NOT NULL,
  tracked_jobs  TEXT    NOT NULL DEFAULT '[]',
  have          TEXT    NOT NULL DEFAULT '{}',
  steps         TEXT    NOT NULL DEFAULT '{}',
  content_hash  TEXT    NOT NULL DEFAULT '',
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lodestone_id, expansion_key)
);

CREATE INDEX IF NOT EXISTS idx_artifact_user
  ON artifact_progress(user_id, lodestone_id);
