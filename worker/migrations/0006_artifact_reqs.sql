-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Migration 0006 — track prerequisite checkoffs in artifact_progress
--
--  reqs: JSON map of requirement text -> true, e.g.
--        '{"Level 80 combat job (DoW/DoM)": true}'.
--        Honor-system checkboxes; a step only unlocks once its own
--        requirements are checked (or the step is already done).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE artifact_progress ADD COLUMN reqs TEXT NOT NULL DEFAULT '{}';
