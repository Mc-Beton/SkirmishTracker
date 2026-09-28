-- Point-difference scoring table and detailed game tracking (turns, schemes) (stage 2a)

ALTER TABLE tournaments ADD COLUMN difference_table VARCHAR(1000) NOT NULL
    DEFAULT '0:10:10;2:11:9;4:12:8;6:13:7;8:14:6;*:15:5';

ALTER TABLE tournament_rounds ADD COLUMN scenario_code VARCHAR(60);

CREATE TABLE match_scheme_draws (
    id         UUID PRIMARY KEY,
    match_id   UUID         NOT NULL REFERENCES tournament_matches (id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL REFERENCES users (id),
    faction    VARCHAR(60)  NOT NULL,
    leader_int INTEGER      NOT NULL,
    cards      VARCHAR(400) NOT NULL,
    kept_code  VARCHAR(60),
    created_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_scheme_draw UNIQUE (match_id, user_id)
);

CREATE TABLE match_turn_scores (
    id          UUID PRIMARY KEY,
    match_id    UUID        NOT NULL REFERENCES tournament_matches (id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users (id),
    turn        INTEGER     NOT NULL,
    scenario_vp INTEGER     NOT NULL DEFAULT 0,
    scheme_vp   INTEGER     NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL,
    updated_by  UUID        NOT NULL,
    CONSTRAINT ux_turn_score UNIQUE (match_id, user_id, turn),
    CONSTRAINT ck_turn CHECK (turn BETWEEN 1 AND 10),
    CONSTRAINT ck_turn_vp CHECK (scenario_vp BETWEEN 0 AND 100 AND scheme_vp BETWEEN 0 AND 100)
);
CREATE INDEX ix_turn_scores_match ON match_turn_scores (match_id);
