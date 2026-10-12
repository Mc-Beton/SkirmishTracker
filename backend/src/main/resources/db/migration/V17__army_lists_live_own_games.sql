-- "My lists": players' saved lists (templates). Choosing one for a tournament or an own game copies it, so
-- editing a saved list never changes what was played (reports and the meta read the copies).
CREATE TABLE army_lists (
    id             UUID PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    number         INTEGER     NOT NULL,
    name           VARCHAR(80),
    list_format    VARCHAR(20) NOT NULL,
    faction        VARCHAR(60) NOT NULL,
    allied_faction VARCHAR(60),
    leader_int     INTEGER     NOT NULL DEFAULT 0,
    total_points   INTEGER     NOT NULL,
    units          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL,
    version        BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ux_army_list_number UNIQUE (user_id, number),
    CONSTRAINT ck_army_list_number CHECK (number > 0)
);

-- Which saved list a tournament list was copied from (only to show "changed since" and offer an update).
ALTER TABLE warbands ADD COLUMN source_list_id UUID REFERENCES army_lists (id) ON DELETE SET NULL;

-- Own games played turn by turn (status IN_PROGRESS until one of the players finishes the game).
CREATE TABLE friendly_turn_scores (
    id          UUID PRIMARY KEY,
    game_id     UUID        NOT NULL REFERENCES friendly_games (id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users (id),
    turn        INTEGER     NOT NULL,
    scenario_vp INTEGER     NOT NULL,
    scheme_vp   INTEGER     NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    updated_by  UUID        NOT NULL REFERENCES users (id),
    CONSTRAINT ux_friendly_turn UNIQUE (game_id, user_id, turn)
);
