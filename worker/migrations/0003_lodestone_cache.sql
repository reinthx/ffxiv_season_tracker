-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Migration 0003
--  Cache richer Lodestone character data in tracker_saves
--  so it survives across devices for Discord users.
--
--  lodestone_title:       Character title (e.g. "Dragon's Slayer")
--  lodestone_fc:          Free Company name, nullable
--  lodestone_class:       Active class/job name (e.g. "Paladin")
--  lodestone_class_level: Active class/job level (integer)
--  lodestone_classes:     JSON array of ALL classes + levels, for a
--                         future character page. Shape:
--                         [{ "name": "Paladin", "level": 90, "type": "combat" }, ...]
--                         NULL until that page is implemented.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE tracker_saves ADD COLUMN lodestone_title       TEXT;
ALTER TABLE tracker_saves ADD COLUMN lodestone_fc          TEXT;
ALTER TABLE tracker_saves ADD COLUMN lodestone_class       TEXT;
ALTER TABLE tracker_saves ADD COLUMN lodestone_class_level INTEGER;
ALTER TABLE tracker_saves ADD COLUMN lodestone_classes     TEXT;
