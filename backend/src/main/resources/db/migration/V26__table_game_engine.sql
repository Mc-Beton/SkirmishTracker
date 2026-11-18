-- Online table on the game engine (rules service, rules/): which engine a table plays by, the players' secret
-- Scheme cards (never part of the event log), a short summary of the game for lists and result reports, and the
-- factions of the two lists (the legacy engine kept them in its events).
ALTER TABLE game_tables ADD COLUMN engine VARCHAR(10) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE game_tables ADD CONSTRAINT ck_table_engine CHECK (engine IN ('LEGACY', 'GAME'));
ALTER TABLE game_tables ADD COLUMN scheme_hands TEXT;
ALTER TABLE game_tables ADD COLUMN game_summary TEXT;
ALTER TABLE game_tables ADD COLUMN faction_a VARCHAR(40);
ALTER TABLE game_tables ADD COLUMN allied_a VARCHAR(40);
ALTER TABLE game_tables ADD COLUMN faction_b VARCHAR(40);
ALTER TABLE game_tables ADD COLUMN allied_b VARCHAR(40);
