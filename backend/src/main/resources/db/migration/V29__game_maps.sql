-- Maps for 3D tables made in the admin's map creator: a ground of the game and terrain elements placed on it
-- (frontend/src/lib/eld/maps.ts: BASES, KITS). Every such map is also played in 2D (the same map from above).
-- Only published maps can be chosen when a table is created. The rules service checks a map before it is stored.
CREATE TABLE game_maps (
    id         UUID         PRIMARY KEY,
    name       VARCHAR(80)  NOT NULL,
    base       VARCHAR(40)  NOT NULL,
    items      TEXT         NOT NULL,
    published  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by UUID         REFERENCES users (id),
    created_at TIMESTAMPTZ  NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL
);
