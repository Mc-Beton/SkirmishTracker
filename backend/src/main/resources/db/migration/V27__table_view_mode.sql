-- Online table in 3D: a table is either 2D (a WarBracket map: background picture and placed elements) or 3D (a map of
-- the game, frontend/src/lib/eld/maps.ts, drawn with models). The view is chosen when the table is created.
ALTER TABLE game_tables ADD COLUMN view_mode VARCHAR(2) NOT NULL DEFAULT '2D';
ALTER TABLE game_tables ADD CONSTRAINT ck_table_view_mode CHECK (view_mode IN ('2D', '3D'));
ALTER TABLE game_tables ADD COLUMN game_map VARCHAR(40);
