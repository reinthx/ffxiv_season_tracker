-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Move sessions from KV to D1
--  Frees up the KV write budget (1,000/day free tier) by
--  routing all session reads/writes through D1 instead.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_id TEXT    NOT NULL,
  username   TEXT    NOT NULL,
  avatar     TEXT,
  expires_at INTEGER NOT NULL   -- Unix seconds
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
