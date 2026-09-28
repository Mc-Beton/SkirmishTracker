-- Warband lists (stage 2b)

CREATE TABLE warbands (
    id             UUID PRIMARY KEY,
    tournament_id  UUID          NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id        UUID          NOT NULL REFERENCES users (id),
    faction        VARCHAR(60)   NOT NULL,
    allied_faction VARCHAR(60),
    leader_int     INTEGER       NOT NULL,
    total_points   INTEGER       NOT NULL,
    units          TEXT NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL,
    updated_at     TIMESTAMPTZ   NOT NULL,
    version        BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_warband_tournament_user UNIQUE (tournament_id, user_id)
);
