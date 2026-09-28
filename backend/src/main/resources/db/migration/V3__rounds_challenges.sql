-- Swiss rounds, results, challenges, penalties and pairing/scoring settings (stage 1b)

ALTER TABLE users ADD COLUMN club VARCHAR(80);
ALTER TABLE users ADD COLUMN home_city VARCHAR(80);

ALTER TABLE tournaments ADD COLUMN first_round_mode VARCHAR(30) NOT NULL DEFAULT 'RANDOM';
ALTER TABLE tournaments ADD COLUMN challenges_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN challenges_public BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tournaments ADD COLUMN avoid_same_club BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN avoid_same_faction BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN avoid_same_city BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN soft_prefs_first_round BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN scoring_mode VARCHAR(30) NOT NULL DEFAULT 'WIN_DRAW_LOSS';
ALTER TABLE tournaments ADD COLUMN win_points INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournaments ADD COLUMN draw_points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN loss_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN small_points_multiplier INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tournaments ADD COLUMN bye_big_points INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournaments ADD COLUMN bye_small_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN split_big_points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN split_small_points INTEGER NOT NULL DEFAULT 0;

-- Snapshot at registration time so later profile edits do not rewrite tournament history.
ALTER TABLE tournament_participants ADD COLUMN club VARCHAR(80);
ALTER TABLE tournament_participants ADD COLUMN city VARCHAR(80);
-- Filled from the warband list (stage 2).
ALTER TABLE tournament_participants ADD COLUMN faction VARCHAR(60);
ALTER TABLE tournament_participants ADD COLUMN dropped BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE tournament_challenges (
    id             UUID PRIMARY KEY,
    tournament_id  UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    challenger_id  UUID        NOT NULL REFERENCES users (id),
    challenged_id  UUID        NOT NULL REFERENCES users (id),
    status         VARCHAR(20) NOT NULL,
    organizer_made BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL,
    responded_at   TIMESTAMPTZ,
    CONSTRAINT ck_challenge_distinct CHECK (challenger_id <> challenged_id)
);
CREATE INDEX ix_challenges_tournament ON tournament_challenges (tournament_id, status);

CREATE TABLE tournament_rounds (
    id               UUID PRIMARY KEY,
    tournament_id    UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    number           INTEGER     NOT NULL,
    status           VARCHAR(20) NOT NULL,
    bye_big_points   INTEGER     NOT NULL,
    bye_small_points INTEGER     NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    CONSTRAINT ux_round_number UNIQUE (tournament_id, number)
);

CREATE TABLE tournament_matches (
    id            UUID PRIMARY KEY,
    round_id      UUID        NOT NULL REFERENCES tournament_rounds (id) ON DELETE CASCADE,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    table_number  INTEGER     NOT NULL,
    player_a      UUID        NOT NULL REFERENCES users (id),
    player_b      UUID REFERENCES users (id),
    result_type   VARCHAR(20),
    small_a       INTEGER,
    small_b       INTEGER,
    status        VARCHAR(20) NOT NULL,
    reported_by   UUID,
    reported_at   TIMESTAMPTZ,
    confirmed_by  UUID,
    confirmed_at  TIMESTAMPTZ,
    version       BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_small_points CHECK ((small_a IS NULL OR small_a BETWEEN 0 AND 1000)
                                       AND (small_b IS NULL OR small_b BETWEEN 0 AND 1000))
);
CREATE INDEX ix_matches_round ON tournament_matches (round_id);
CREATE INDEX ix_matches_tournament ON tournament_matches (tournament_id);

CREATE TABLE tournament_penalties (
    id            UUID PRIMARY KEY,
    tournament_id UUID         NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES users (id),
    big_points    INTEGER      NOT NULL,
    reason        VARCHAR(300) NOT NULL,
    created_by    UUID         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_penalties_tournament ON tournament_penalties (tournament_id);
