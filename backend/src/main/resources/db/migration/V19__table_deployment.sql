-- Deployment Zones of an online table, from the quest: STANDARD (belts along opposite edges) or CORNER (9" quarter
-- circles in opposite corners). Older tables keep the standard belts.
ALTER TABLE game_tables ADD COLUMN deployment VARCHAR(10) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE game_tables ADD CONSTRAINT ck_table_deployment CHECK (deployment IN ('STANDARD', 'CORNER'));
