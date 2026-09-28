-- Elimination (single, with optional top cut after Swiss / round robin) and round robin (stage 3)

ALTER TABLE tournaments ADD COLUMN top_cut INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD CONSTRAINT ck_top_cut CHECK (top_cut IN (0, 2, 4, 8, 16, 32));

ALTER TABLE tournament_rounds ADD COLUMN phase VARCHAR(20) NOT NULL DEFAULT 'SWISS';

-- Bracket seeds of a knockout match (null outside the knockout phase).
ALTER TABLE tournament_matches ADD COLUMN seed_a INTEGER;
ALTER TABLE tournament_matches ADD COLUMN seed_b INTEGER;

-- Fixed order for round robin / elimination seeding, assigned when round 1 is paired.
ALTER TABLE tournament_participants ADD COLUMN seed INTEGER;
