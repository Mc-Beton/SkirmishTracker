-- Free game (sandbox): no map or lists up front – the mat, terrain and models are put on the table during the game,
-- and the creator may play both sides alone until an opponent joins.
ALTER TABLE game_tables ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE game_tables ADD CONSTRAINT ck_table_mode CHECK (mode IN ('STANDARD', 'SANDBOX'));
