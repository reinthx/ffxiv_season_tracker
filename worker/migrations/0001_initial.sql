-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  FFXIV Tracker — D1 initial schema
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Discord-authenticated users.
-- Uses ON CONFLICT DO UPDATE on re-login so the auto-increment id
-- (and its foreign key references) are never changed.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id   TEXT    NOT NULL UNIQUE,
  username     TEXT    NOT NULL,
  avatar       TEXT,                              -- Discord avatar hash, nullable
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One save slot per character per user.
--
-- lodestone_id: Lodestone numeric string (e.g. "12345678"), OR a synthetic
--   "manual:<lower_name>|<lower_world>" key for characters without a Lodestone ID.
--   Always NOT NULL so the UNIQUE constraint is clean.
--
-- data: the compact URLSearchParams blob already produced by encodeS() in app.js
--   (l=&x=&g=&us=&cn=&cw=&cl=&sd=…). Drop-in, no re-encoding needed.
--
-- label: optional user-given nickname ("Main", "Alt Tank", etc.).
--   Defaults to character_name in the UI when NULL.
CREATE TABLE IF NOT EXISTS tracker_saves (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lodestone_id     TEXT    NOT NULL,
  character_name   TEXT    NOT NULL,
  character_world  TEXT,
  label            TEXT,
  portrait_url     TEXT,
  avatar_url       TEXT,
  data             TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, lodestone_id)
);

CREATE INDEX IF NOT EXISTS idx_saves_user ON tracker_saves(user_id);

-- Moogle Tome event progress — one row per user per event.
--
-- event_key:        e.g. "moogle-2025-spring" — stable slug for the event.
-- wishlist:         JSON array of targeted item ids/slugs.
-- tomes_current:    How many tomes the user currently has.
--
-- Seasonal objectives — each is a JSON array of booleans (index = challenge slot):
--   weekly_objectives:   Resets each week. e.g. [true, false, true, false]
--   standard_objectives: One-time per event. e.g. [true, true, false]
--   minimog_challenges:  Special tier challenges. e.g. [false, false]
--   ultimog_challenges:  Hardest tier challenges. e.g. [false]
--
-- Storing as JSON arrays rather than individual columns keeps the schema
-- stable as SE adds/removes challenge slots between events.
CREATE TABLE IF NOT EXISTS moogle_progress (
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key             TEXT    NOT NULL,
  wishlist              TEXT    NOT NULL DEFAULT '[]',
  tomes_current         INTEGER NOT NULL DEFAULT 0,
  weekly_objectives     TEXT    NOT NULL DEFAULT '[]',
  standard_objectives   TEXT    NOT NULL DEFAULT '[]',
  minimog_challenges    TEXT    NOT NULL DEFAULT '[]',
  ultimog_challenges    TEXT    NOT NULL DEFAULT '[]',
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, event_key)
);
