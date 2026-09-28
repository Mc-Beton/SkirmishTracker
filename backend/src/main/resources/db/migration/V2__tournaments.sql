-- Tournaments, registrations and audit trail (stage 1)

CREATE TABLE tournaments (
    id                 UUID PRIMARY KEY,
    owner_id           UUID          NOT NULL REFERENCES users (id),
    name               VARCHAR(120)  NOT NULL,
    description        VARCHAR(10000),
    starts_at          TIMESTAMPTZ   NOT NULL,
    ends_at            TIMESTAMPTZ,
    venue_name         VARCHAR(120),
    address            VARCHAR(200),
    city               VARCHAR(80)   NOT NULL,
    country            VARCHAR(2)    NOT NULL DEFAULT 'PL',
    entry_fee_amount   NUMERIC(10, 2),
    entry_fee_currency VARCHAR(3),
    tournament_rank    VARCHAR(20)   NOT NULL,
    format             VARCHAR(20)   NOT NULL,
    max_players        INTEGER,
    points_limit       INTEGER,
    rounds_planned     INTEGER,
    list_deadline      TIMESTAMPTZ,
    status             VARCHAR(30)   NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL,
    updated_at         TIMESTAMPTZ   NOT NULL,
    version            BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_tournament_max_players CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 512),
    CONSTRAINT ck_tournament_fee CHECK (entry_fee_amount IS NULL OR entry_fee_amount >= 0)
);
CREATE INDEX ix_tournaments_status_start ON tournaments (status, starts_at);
CREATE INDEX ix_tournaments_owner ON tournaments (owner_id);

CREATE TABLE tournament_participants (
    id            UUID PRIMARY KEY,
    tournament_id UUID        NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL,
    paid          BOOLEAN     NOT NULL DEFAULT FALSE,
    list_status   VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED',
    CONSTRAINT ux_participant_tournament_user UNIQUE (tournament_id, user_id)
);
CREATE INDEX ix_participants_tournament_status ON tournament_participants (tournament_id, status, registered_at);
CREATE INDEX ix_participants_user ON tournament_participants (user_id);

-- Who changed what (organizer edits of players, payments, results later on).
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY,
    actor_id    UUID          NOT NULL,
    entity_type VARCHAR(40)   NOT NULL,
    entity_id   UUID          NOT NULL,
    action      VARCHAR(60)   NOT NULL,
    details     VARCHAR(2000),
    created_at  TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_audit_entity ON audit_log (entity_type, entity_id, created_at);
