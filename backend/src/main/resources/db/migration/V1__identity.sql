-- Identity & sessions (stage 0)

CREATE TABLE users (
    id                    UUID PRIMARY KEY,
    email                 VARCHAR(320) NOT NULL,
    display_name          VARCHAR(40)  NOT NULL,
    password_hash         VARCHAR(255),
    email_verified_at     TIMESTAMPTZ,
    locale                VARCHAR(5)   NOT NULL DEFAULT 'pl',
    failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL,
    updated_at            TIMESTAMPTZ  NOT NULL,
    version               BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email));
CREATE UNIQUE INDEX ux_users_display_name ON users (lower(display_name));

CREATE TABLE user_roles (
    user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role    VARCHAR(20) NOT NULL,
    PRIMARY KEY (user_id, role)
);

-- External logins (Google, Discord)
CREATE TABLE user_identities (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider   VARCHAR(20)  NOT NULL,
    subject    VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT ux_identity_provider_subject UNIQUE (provider, subject)
);

-- Rotating refresh tokens; only SHA-256 hashes are stored.
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    family_id   UUID        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL,
    user_agent  VARCHAR(255),
    ip_address  VARCHAR(64)
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);

-- Single-use tokens: e-mail verification, password reset.
CREATE TABLE one_time_tokens (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       VARCHAR(30) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_one_time_tokens_user_type ON one_time_tokens (user_id, type);
