-- Team tournaments: teams of a fixed size, team pairings, captains' line-ups (stage 5)

ALTER TABLE tournaments ADD COLUMN team_size INTEGER;
ALTER TABLE tournaments ADD COLUMN team_unique_factions BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD CONSTRAINT ck_team_size CHECK (team_size IS NULL OR team_size BETWEEN 2 AND 5);

CREATE TABLE teams (
    id            UUID PRIMARY KEY,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    name          VARCHAR(60) NOT NULL,
    captain_id    UUID        NOT NULL REFERENCES users (id),
    seed          INTEGER,
    dropped       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX ux_team_name ON teams (tournament_id, lower(name));

CREATE TABLE team_members (
    id            UUID PRIMARY KEY,
    team_id       UUID        NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users (id),
    position      INTEGER     NOT NULL,
    status        VARCHAR(20) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    CONSTRAINT ux_team_member UNIQUE (team_id, user_id)
);
-- A player belongs to at most one team per tournament.
CREATE UNIQUE INDEX ux_team_member_accepted ON team_members (tournament_id, user_id) WHERE status = 'ACCEPTED';

CREATE TABLE team_matches (
    id            UUID PRIMARY KEY,
    round_id      UUID        NOT NULL REFERENCES tournament_rounds (id) ON DELETE CASCADE,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    group_number  INTEGER     NOT NULL,
    team_a        UUID        NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    team_b        UUID REFERENCES teams (id) ON DELETE CASCADE,
    seed_a        INTEGER,
    seed_b        INTEGER,
    lineup_a      VARCHAR(400),
    lineup_b      VARCHAR(400)
);
CREATE INDEX ix_team_matches_round ON team_matches (round_id);

ALTER TABLE tournament_matches ADD COLUMN team_match_id UUID REFERENCES team_matches (id) ON DELETE CASCADE;
