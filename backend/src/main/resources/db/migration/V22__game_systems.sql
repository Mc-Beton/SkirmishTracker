-- Game systems: Eldfall Chronicles (existing data) and Bolt Action (tournaments, leagues, ELO).

ALTER TABLE tournaments ADD COLUMN game_system VARCHAR(20) NOT NULL DEFAULT 'ELDFALL';
ALTER TABLE tournaments ADD CONSTRAINT ck_tournament_game_system CHECK (game_system IN ('ELDFALL', 'BOLT_ACTION'));
-- Second score slot per game (Bolt Action: scenario points + secondary objectives) and organizer limits.
ALTER TABLE tournaments ADD COLUMN secondary_slot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN max_primary_points INTEGER;
ALTER TABLE tournaments ADD COLUMN max_secondary_points INTEGER;
-- Bolt Action list limits declared by players (points limit uses the existing points_limit column).
ALTER TABLE tournaments ADD COLUMN max_order_dice INTEGER;
ALTER TABLE tournaments ADD COLUMN max_platoons INTEGER;
-- Who sees the lists of other players (Bolt Action lists).
ALTER TABLE tournaments ADD COLUMN list_visibility VARCHAR(30) NOT NULL DEFAULT 'AFTER_DEADLINE';
ALTER TABLE tournaments ADD CONSTRAINT ck_tournament_list_visibility
    CHECK (list_visibility IN ('AFTER_DEADLINE', 'AFTER_FIRST_PAIRINGS', 'PUBLIC', 'HIDDEN'));
-- Registrations wait for the organizer's approval (they land on the waiting list).
ALTER TABLE tournaments ADD COLUMN require_approval BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX ix_tournaments_system_status_start ON tournaments (game_system, status, starts_at);

ALTER TABLE tournament_matches ADD COLUMN secondary_a INTEGER;
ALTER TABLE tournament_matches ADD COLUMN secondary_b INTEGER;

ALTER TABLE leagues ADD COLUMN game_system VARCHAR(20) NOT NULL DEFAULT 'ELDFALL';
ALTER TABLE leagues ADD CONSTRAINT ck_league_game_system CHECK (game_system IN ('ELDFALL', 'BOLT_ACTION'));

-- Bolt Action tournament lists: nation, declared points / order dice / platoons, list as text and/or a PDF.
CREATE TABLE ba_lists (
    id            UUID PRIMARY KEY,
    tournament_id UUID          NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       UUID          NOT NULL REFERENCES users (id),
    nation        VARCHAR(40)   NOT NULL,
    points        INTEGER       NOT NULL,
    order_dice    INTEGER       NOT NULL,
    platoons      INTEGER       NOT NULL,
    list_text     TEXT,
    pdf_name      VARCHAR(120),
    pdf_size      INTEGER,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL,
    version       BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ux_ba_list_tournament_user UNIQUE (tournament_id, user_id)
);

-- The PDF itself, kept apart so list views never load the bytes.
CREATE TABLE ba_list_pdfs (
    list_id    UUID PRIMARY KEY REFERENCES ba_lists (id) ON DELETE CASCADE,
    bytes      BYTEA        NOT NULL,
    sha256     VARCHAR(64)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL
);
