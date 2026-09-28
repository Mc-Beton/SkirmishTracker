-- Leagues, own (friendly) games and ELO inputs (stage 4)

CREATE TABLE leagues (
    id                       UUID PRIMARY KEY,
    owner_id                 UUID          NOT NULL REFERENCES users (id),
    name                     VARCHAR(120)  NOT NULL,
    description              VARCHAR(4000),
    city                     VARCHAR(80),
    starts_on                DATE          NOT NULL,
    ends_on                  DATE          NOT NULL,
    scoring_mode             VARCHAR(30)   NOT NULL,
    own_games_allowed        BOOLEAN       NOT NULL DEFAULT TRUE,
    place_points             VARCHAR(400)  NOT NULL DEFAULT '10,8,6,5,4,3,2,1',
    participation_points     INTEGER       NOT NULL DEFAULT 1,
    multiplier_local         NUMERIC(5, 2) NOT NULL DEFAULT 1,
    multiplier_master        NUMERIC(5, 2) NOT NULL DEFAULT 1.5,
    multiplier_international NUMERIC(5, 2) NOT NULL DEFAULT 2,
    big_points_multiplier    NUMERIC(5, 2) NOT NULL DEFAULT 1,
    game_win_points          INTEGER       NOT NULL DEFAULT 3,
    game_draw_points         INTEGER       NOT NULL DEFAULT 1,
    game_loss_points         INTEGER       NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ   NOT NULL,
    updated_at               TIMESTAMPTZ   NOT NULL,
    version                  BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_league_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX ix_leagues_owner ON leagues (owner_id);

CREATE TABLE league_members (
    id        UUID PRIMARY KEY,
    league_id UUID        NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
    user_id   UUID        NOT NULL REFERENCES users (id),
    joined_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ux_league_member UNIQUE (league_id, user_id)
);
CREATE INDEX ix_league_members_user ON league_members (user_id);

CREATE TABLE league_tournaments (
    id            UUID PRIMARY KEY,
    league_id     UUID        NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL,
    requested_by  UUID        NOT NULL REFERENCES users (id),
    requested_at  TIMESTAMPTZ NOT NULL,
    decided_at    TIMESTAMPTZ,
    CONSTRAINT ux_league_tournament UNIQUE (league_id, tournament_id)
);
CREATE INDEX ix_league_tournaments_tournament ON league_tournaments (tournament_id);

CREATE TABLE friendly_games (
    id            UUID PRIMARY KEY,
    player_a      UUID        NOT NULL REFERENCES users (id),
    player_b      UUID        NOT NULL REFERENCES users (id),
    small_a       INTEGER     NOT NULL,
    small_b       INTEGER     NOT NULL,
    played_on     DATE        NOT NULL,
    scenario_code VARCHAR(60),
    faction_a     VARCHAR(60),
    faction_b     VARCHAR(60),
    league_id     UUID REFERENCES leagues (id) ON DELETE SET NULL,
    notes         VARCHAR(500),
    status        VARCHAR(20) NOT NULL,
    reported_by   UUID        NOT NULL REFERENCES users (id),
    created_at    TIMESTAMPTZ NOT NULL,
    decided_at    TIMESTAMPTZ,
    version       BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_friendly_players CHECK (player_a <> player_b),
    CONSTRAINT ck_friendly_score CHECK (small_a BETWEEN 0 AND 1000 AND small_b BETWEEN 0 AND 1000)
);
CREATE INDEX ix_friendly_a ON friendly_games (player_a);
CREATE INDEX ix_friendly_b ON friendly_games (player_b);
CREATE INDEX ix_friendly_league ON friendly_games (league_id);
