-- Messages sent through the public contact form (/support). Deleted after 365 days.
CREATE TABLE support_messages (
    id         UUID PRIMARY KEY,
    user_id    UUID          REFERENCES users (id) ON DELETE SET NULL,
    email      VARCHAR(320)  NOT NULL,
    name       VARCHAR(80),
    topic      VARCHAR(20)   NOT NULL,
    message    VARCHAR(5000) NOT NULL,
    locale     VARCHAR(5)    NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_support_messages_created ON support_messages (created_at);
