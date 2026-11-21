-- Online table: after the game each player confirms the result at the table. When both have, the game is saved as a
-- confirmed own game (ELO, leagues, statistics) with its points round by round. A change on the table takes the
-- confirmations back.
ALTER TABLE game_tables ADD COLUMN result_ok_a BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE game_tables ADD COLUMN result_ok_b BOOLEAN NOT NULL DEFAULT FALSE;
