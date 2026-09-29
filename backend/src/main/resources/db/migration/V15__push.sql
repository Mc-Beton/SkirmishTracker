-- Web Push: browser subscriptions and the server's VAPID key pair (generated once unless set in the environment).

CREATE TABLE push_subscriptions (
    id              UUID PRIMARY KEY,
    user_id         UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint        VARCHAR(1000) NOT NULL UNIQUE,
    p256dh          VARCHAR(200)  NOT NULL,
    auth            VARCHAR(100)  NOT NULL,
    user_agent      VARCHAR(255),
    created_at      TIMESTAMPTZ   NOT NULL,
    last_success_at TIMESTAMPTZ
);
CREATE INDEX ix_push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE push_keys (
    id          SMALLINT PRIMARY KEY,
    public_key  VARCHAR(200) NOT NULL,
    private_key VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ck_push_keys_single CHECK (id = 1)
);
