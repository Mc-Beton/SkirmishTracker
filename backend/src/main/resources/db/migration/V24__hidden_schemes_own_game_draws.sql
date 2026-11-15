-- Schemes stay secret until their owner reveals them (tournament games and own games played in the app).
-- Draws made before this change stay visible.
ALTER TABLE match_scheme_draws ADD COLUMN revealed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE match_scheme_draws SET revealed = TRUE;

CREATE TABLE friendly_scheme_draws (
    id         UUID PRIMARY KEY,
    game_id    UUID         NOT NULL REFERENCES friendly_games (id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL REFERENCES users (id),
    faction    VARCHAR(60)  NOT NULL,
    leader_int INTEGER      NOT NULL,
    cards      VARCHAR(400) NOT NULL,
    kept_code  VARCHAR(60),
    revealed   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_friendly_scheme_draw UNIQUE (game_id, user_id)
);
