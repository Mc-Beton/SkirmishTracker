-- Per-round plan set in the tournament creator: scenario, pairing method, table order, soft preferences

CREATE TABLE tournament_round_plans (
    id               UUID PRIMARY KEY,
    tournament_id    UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    number           INTEGER     NOT NULL,
    scenario_code    VARCHAR(60),
    pairing          VARCHAR(30),
    table_order      VARCHAR(20) NOT NULL DEFAULT 'BY_STANDINGS',
    soft_preferences BOOLEAN,
    CONSTRAINT ux_round_plan UNIQUE (tournament_id, number),
    CONSTRAINT ck_round_plan_number CHECK (number BETWEEN 1 AND 30)
);

-- How the pairs of a generated round were placed on tables (for information in the round view).
ALTER TABLE tournament_rounds ADD COLUMN table_order VARCHAR(20);
