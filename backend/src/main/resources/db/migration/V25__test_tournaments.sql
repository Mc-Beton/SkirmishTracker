-- Test tournaments: never public, visible to their organizers and invited participants only, excluded from ELO,
-- leagues, seasons, calendar and profile statistics. Dummy players are accounts that cannot sign in.
ALTER TABLE tournaments ADD COLUMN test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN dummy BOOLEAN NOT NULL DEFAULT FALSE;
