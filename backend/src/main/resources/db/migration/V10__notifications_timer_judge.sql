-- In-app notifications, round timer and judge calls (stage 5)

CREATE TABLE notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       VARCHAR(40)   NOT NULL,
    params     VARCHAR(2000) NOT NULL DEFAULT '{}',
    link       VARCHAR(300),
    created_at TIMESTAMPTZ   NOT NULL,
    read_at    TIMESTAMPTZ
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);

-- Round timer: total seconds (incl. added time), seconds elapsed while paused, running since.
ALTER TABLE tournament_rounds ADD COLUMN timer_seconds INTEGER;
ALTER TABLE tournament_rounds ADD COLUMN timer_elapsed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_rounds ADD COLUMN timer_running_since TIMESTAMPTZ;
ALTER TABLE tournament_rounds ADD COLUMN timer_notified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournament_round_plans ADD COLUMN duration_minutes INTEGER;

CREATE TABLE judge_calls (
    id            UUID PRIMARY KEY,
    tournament_id UUID         NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    match_id      UUID         NOT NULL REFERENCES tournament_matches (id) ON DELETE CASCADE,
    requested_by  UUID         NOT NULL REFERENCES users (id),
    note          VARCHAR(300),
    created_at    TIMESTAMPTZ  NOT NULL,
    resolved_at   TIMESTAMPTZ,
    resolved_by   UUID REFERENCES users (id)
);
CREATE INDEX ix_judge_calls_tournament ON judge_calls (tournament_id, resolved_at);
