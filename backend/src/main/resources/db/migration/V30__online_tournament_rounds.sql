-- Online tournament rounds: a round whose plan names a map of the game is played on online tables. Starting the
-- round opens a table for every match (both players seated with their tournament lists); when the game on it ends,
-- its Victory Points become the result of the match.
ALTER TABLE tournament_round_plans ADD COLUMN game_map VARCHAR(40);
ALTER TABLE tournament_rounds ADD COLUMN game_map VARCHAR(40);
ALTER TABLE game_tables ADD COLUMN match_id UUID REFERENCES tournament_matches (id) ON DELETE SET NULL;
ALTER TABLE game_tables ADD COLUMN match_reported BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX ux_game_tables_match ON game_tables (match_id) WHERE match_id IS NOT NULL;
