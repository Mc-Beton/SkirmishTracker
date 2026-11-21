-- Players' teams ("Drużyny"): one player founds a team and owns it. Players join by the team's link, by an
-- invitation of the owner (accepted by the invited player) or by asking (accepted by the owner). A player is in at
-- most one team. users.club keeps the name of the player's team (pairing preferences, rankings and profiles read it);
-- names typed in by hand before teams existed stay until the player joins a team.
-- (Tournament teams are something else: tables teams / team_members, made for one team tournament.)
CREATE TABLE clubs (
    id          UUID PRIMARY KEY,
    name        VARCHAR(80) NOT NULL,
    owner_id    UUID        NOT NULL REFERENCES users (id),
    invite_hash VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX ux_clubs_name ON clubs (lower(name));
CREATE UNIQUE INDEX ux_clubs_invite ON clubs (invite_hash) WHERE invite_hash IS NOT NULL;
CREATE INDEX ix_clubs_owner ON clubs (owner_id);

CREATE TABLE club_members (
    club_id   UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
    user_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (club_id, user_id)
);
-- a player is in at most one team
CREATE UNIQUE INDEX ux_club_members_user ON club_members (user_id);

-- INVITE: the owner asked the player; REQUEST: the player asked the owner
CREATE TABLE club_requests (
    club_id    UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (club_id, user_id),
    CONSTRAINT ck_club_request_kind CHECK (kind IN ('INVITE', 'REQUEST'))
);
CREATE INDEX ix_club_requests_user ON club_requests (user_id);
