-- Roster format (Eldfall competitive Season 2): players submit a roster (e.g. 125 pts) before the event and pick
-- a party (e.g. 85 pts) from it for every game, after the quest and the opponent's faction are known.

ALTER TABLE tournaments ADD COLUMN list_format VARCHAR(20) NOT NULL DEFAULT 'CLASSIC';
ALTER TABLE tournaments ADD COLUMN party_limit INTEGER;
ALTER TABLE tournaments ADD COLUMN hidden_rosters BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD CONSTRAINT ck_party_limit CHECK (party_limit IS NULL OR party_limit BETWEEN 1 AND 10000);

-- The party one player fields in one game: roster entries (with the chosen upgrades) and the leader.
CREATE TABLE match_parties (
    id           UUID PRIMARY KEY,
    match_id     UUID        NOT NULL REFERENCES tournament_matches (id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users (id),
    units        TEXT        NOT NULL,
    leader_int   INTEGER     NOT NULL,
    total_points INTEGER     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    version      BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ux_match_party UNIQUE (match_id, user_id)
);
