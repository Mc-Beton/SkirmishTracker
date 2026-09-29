-- Official tournaments (marked by the publisher / admin) and seasons with a seasonal ranking.

ALTER TABLE tournaments ADD COLUMN official BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN official_by UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN official_at TIMESTAMPTZ;
CREATE INDEX ix_tournaments_official ON tournaments (starts_at) WHERE official;

CREATE TABLE seasons (
    id                   UUID PRIMARY KEY,
    name                 VARCHAR(80) NOT NULL,
    starts_on            DATE        NOT NULL,
    ends_on              DATE        NOT NULL,
    points_local         INTEGER     NOT NULL DEFAULT 100,
    points_master        INTEGER     NOT NULL DEFAULT 200,
    points_international INTEGER     NOT NULL DEFAULT 400,
    best_results         INTEGER     NOT NULL DEFAULT 4,
    created_at           TIMESTAMPTZ NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL,
    version              BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_season_dates CHECK (ends_on >= starts_on),
    CONSTRAINT ck_season_points CHECK (points_local BETWEEN 0 AND 10000 AND points_master BETWEEN 0 AND 10000
                                       AND points_international BETWEEN 0 AND 10000),
    CONSTRAINT ck_season_best CHECK (best_results BETWEEN 1 AND 50)
);
