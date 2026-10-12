-- Online table (docs/online-play.md): terrain library, map backgrounds, saved maps, game tables and their event log.

-- Pictures uploaded by admins (map backgrounds and terrain pieces). Immutable; referenced by id.
CREATE TABLE table_images (
    id           UUID PRIMARY KEY,
    owner_id     UUID         NOT NULL REFERENCES users (id),
    content_type VARCHAR(20)  NOT NULL,
    bytes        BYTEA        NOT NULL,
    width_px     INTEGER      NOT NULL,
    height_px    INTEGER      NOT NULL,
    sha256       VARCHAR(64)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL
);

-- Decorative map backgrounds with their natural areas (water, forest…), drawn by an admin.
CREATE TABLE table_backgrounds (
    id         UUID PRIMARY KEY,
    name       VARCHAR(80)      NOT NULL,
    image_id   UUID             NOT NULL REFERENCES table_images (id),
    width_in   DOUBLE PRECISION NOT NULL,
    height_in  DOUBLE PRECISION NOT NULL,
    areas      TEXT             NOT NULL,
    active     BOOLEAN          NOT NULL DEFAULT TRUE,
    created_by UUID             NOT NULL REFERENCES users (id),
    created_at TIMESTAMPTZ      NOT NULL,
    updated_at TIMESTAMPTZ      NOT NULL,
    version    BIGINT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_background_size CHECK (width_in BETWEEN 12 AND 72 AND height_in BETWEEN 12 AND 72)
);

-- Terrain library: picture of a piece + its shapes (walls with thickness, obstacles, areas), drawn by an admin.
CREATE TABLE table_terrain_pieces (
    id         UUID PRIMARY KEY,
    name       VARCHAR(80)      NOT NULL,
    category   VARCHAR(30)      NOT NULL,
    image_id   UUID             NOT NULL REFERENCES table_images (id),
    width_in   DOUBLE PRECISION NOT NULL,
    height_in  DOUBLE PRECISION NOT NULL,
    shapes     TEXT             NOT NULL,
    active     BOOLEAN          NOT NULL DEFAULT TRUE,
    created_by UUID             NOT NULL REFERENCES users (id),
    created_at TIMESTAMPTZ      NOT NULL,
    updated_at TIMESTAMPTZ      NOT NULL,
    version    BIGINT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_piece_size CHECK (width_in > 0 AND width_in <= 36 AND height_in > 0 AND height_in <= 36)
);

-- Maps: a background plus placed terrain pieces. Players save their own (public or private);
-- admins publish official ones.
CREATE TABLE table_maps (
    id               UUID PRIMARY KEY,
    name             VARCHAR(80)      NOT NULL,
    owner_id         UUID             NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    background_id    UUID             NOT NULL REFERENCES table_backgrounds (id),
    placements       TEXT             NOT NULL,
    deployment_depth DOUBLE PRECISION NOT NULL DEFAULT 8,
    is_public        BOOLEAN          NOT NULL DEFAULT FALSE,
    official         BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ      NOT NULL,
    updated_at       TIMESTAMPTZ      NOT NULL,
    version          BIGINT           NOT NULL DEFAULT 0
);
CREATE INDEX ix_table_maps_owner ON table_maps (owner_id);
CREATE INDEX ix_table_maps_name ON table_maps (lower(name));

-- A game played on the online table. The map is copied in (snapshot), so later edits of the map or the
-- library never change a running or finished game.
CREATE TABLE game_tables (
    id               UUID PRIMARY KEY,
    created_by       UUID             NOT NULL REFERENCES users (id),
    player_a         UUID             NOT NULL REFERENCES users (id),
    player_b         UUID             REFERENCES users (id),
    invite_hash      VARCHAR(64),
    status           VARCHAR(20)      NOT NULL,
    map_name         VARCHAR(80)      NOT NULL,
    quest_code       VARCHAR(60),
    map_snapshot     TEXT             NOT NULL,
    width_in         DOUBLE PRECISION NOT NULL,
    height_in        DOUBLE PRECISION NOT NULL,
    deployment_depth DOUBLE PRECISION NOT NULL,
    list_a           TEXT,
    list_b           TEXT,
    next_seq         BIGINT           NOT NULL DEFAULT 1,
    -- the finished game reported as an own game (ELO, leagues, statistics); reported once
    reported_game_id UUID             REFERENCES friendly_games (id) ON DELETE SET NULL,
    -- measuring mode chosen before the game (Core Rules p.18): ASSISTED, STANDARD or REALISM
    measure_mode     VARCHAR(10)      NOT NULL DEFAULT 'ASSISTED',
    -- a judge (one-time invitation) may move any model and undo any step; observers only watch
    judge_id         UUID             REFERENCES users (id),
    judge_invite_hash VARCHAR(64),
    observers_allowed BOOLEAN         NOT NULL DEFAULT FALSE,
    watch_invite_hash VARCHAR(64),
    created_at       TIMESTAMPTZ      NOT NULL,
    updated_at       TIMESTAMPTZ      NOT NULL,
    version          BIGINT           NOT NULL DEFAULT 0,
    CONSTRAINT ck_measure_mode CHECK (measure_mode IN ('ASSISTED', 'STANDARD', 'REALISM'))
);
CREATE INDEX ix_game_tables_player_a ON game_tables (player_a);
CREATE INDEX ix_game_tables_player_b ON game_tables (player_b);
CREATE UNIQUE INDEX ux_game_tables_invite ON game_tables (invite_hash) WHERE invite_hash IS NOT NULL;
CREATE UNIQUE INDEX ux_game_tables_judge_invite ON game_tables (judge_invite_hash) WHERE judge_invite_hash IS NOT NULL;
CREATE UNIQUE INDEX ux_game_tables_watch_invite ON game_tables (watch_invite_hash) WHERE watch_invite_hash IS NOT NULL;
CREATE INDEX ix_game_tables_judge ON game_tables (judge_id);

-- Observers who opened the watch link (read-only; removed when the creator switches observers off).
CREATE TABLE table_watchers (
    table_id  UUID        NOT NULL REFERENCES game_tables (id) ON DELETE CASCADE,
    user_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (table_id, user_id)
);
CREATE INDEX ix_table_watchers_user ON table_watchers (user_id);

-- Append-only event log of a table (undo appends an UNDONE event; nothing is ever updated or deleted).
CREATE TABLE table_events (
    table_id   UUID        NOT NULL REFERENCES game_tables (id) ON DELETE CASCADE,
    seq        BIGINT      NOT NULL,
    side       SMALLINT    NOT NULL,
    author_id  UUID        REFERENCES users (id),
    type       VARCHAR(30) NOT NULL,
    payload    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (table_id, seq)
);
