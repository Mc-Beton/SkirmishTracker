-- Test data only (local development). Adds 5 complete teams of 3 to a team tournament.
-- Seeded accounts log in with e-mail seed-<nick>@example.invalid (e.g. seed-borvin@example.invalid)
-- and the password DruzynyTest2026. The first player of each team is its captain.
-- Target: the tournament named in tname, or (empty) the newest 3-person team tournament still open for sign-ups.
-- Run: docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/team_tournament.sql
DO $$
DECLARE
    tname  TEXT := '';   -- e.g. 'Drużynówka testowa'; empty = newest open 3-person team tournament
    tid    UUID;
    tmax   INT;
    taken  INT;
    team   UUID;
    u      UUID;
    pwd    TEXT := '$argon2id$v=19$m=16384,t=2,p=1$ecJFJfDX8tXq7qgNWKm7yg$YMlEscuP0KId5BGmWRDiWQ5qDlb/QG6YCELO8qVr6YA';
BEGIN
    SELECT id, max_players INTO tid, tmax FROM tournaments
     WHERE team_size = 3 AND status IN ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED')
       AND (tname = '' OR lower(name) = lower(tname))
     ORDER BY created_at DESC LIMIT 1;
    IF tid IS NULL THEN
        RAISE EXCEPTION 'Nie znaleziono otwartego turnieju drużynowego (3 graczy) %', tname;
    END IF;
    RAISE NOTICE 'Turniej: % (%)', (SELECT name FROM tournaments WHERE id = tid), tid;

    -- Stalowa Straż
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('Stalowa Straż')) THEN
        RAISE NOTICE 'Drużyna Stalowa Straż już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam Stalowa Straż';
        ELSE
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Borvin');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-borvin@example.invalid', 'Borvin', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Borvin jest już w drużynie w tym turnieju';
            END IF;
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, 'Stalowa Straż', u, FALSE, now());
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 1, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Ingrid');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-ingrid@example.invalid', 'Ingrid', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Ingrid jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 2, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Tassel');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-tassel@example.invalid', 'Tassel', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Tassel jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 3, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            RAISE NOTICE 'Dodano drużynę Stalowa Straż: Borvin, Ingrid, Tassel (kapitan: Borvin)';
        END IF;
    END IF;

    -- Nocne Sowy
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('Nocne Sowy')) THEN
        RAISE NOTICE 'Drużyna Nocne Sowy już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam Nocne Sowy';
        ELSE
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Morwen');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-morwen@example.invalid', 'Morwen', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Morwen jest już w drużynie w tym turnieju';
            END IF;
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, 'Nocne Sowy', u, FALSE, now());
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 1, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Kestrel');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-kestrel@example.invalid', 'Kestrel', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Kestrel jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 2, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Arlo');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-arlo@example.invalid', 'Arlo', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Arlo jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 3, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            RAISE NOTICE 'Dodano drużynę Nocne Sowy: Morwen, Kestrel, Arlo (kapitan: Morwen)';
        END IF;
    END IF;

    -- Czerwone Smoki
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('Czerwone Smoki')) THEN
        RAISE NOTICE 'Drużyna Czerwone Smoki już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam Czerwone Smoki';
        ELSE
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Rurik');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-rurik@example.invalid', 'Rurik', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Rurik jest już w drużynie w tym turnieju';
            END IF;
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, 'Czerwone Smoki', u, FALSE, now());
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 1, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Selka');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-selka@example.invalid', 'Selka', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Selka jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 2, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Oden');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-oden@example.invalid', 'Oden', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Oden jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 3, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            RAISE NOTICE 'Dodano drużynę Czerwone Smoki: Rurik, Selka, Oden (kapitan: Rurik)';
        END IF;
    END IF;

    -- Gildia Kupców
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('Gildia Kupców')) THEN
        RAISE NOTICE 'Drużyna Gildia Kupców już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam Gildia Kupców';
        ELSE
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Varro');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-varro@example.invalid', 'Varro', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Varro jest już w drużynie w tym turnieju';
            END IF;
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, 'Gildia Kupców', u, FALSE, now());
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 1, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Linnea');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-linnea@example.invalid', 'Linnea', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Linnea jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 2, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Pip');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-pip@example.invalid', 'Pip', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Pip jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 3, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            RAISE NOTICE 'Dodano drużynę Gildia Kupców: Varro, Linnea, Pip (kapitan: Varro)';
        END IF;
    END IF;

    -- Synowie Burzy
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('Synowie Burzy')) THEN
        RAISE NOTICE 'Drużyna Synowie Burzy już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam Synowie Burzy';
        ELSE
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Halvar');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-halvar@example.invalid', 'Halvar', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Halvar jest już w drużynie w tym turnieju';
            END IF;
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, 'Synowie Burzy', u, FALSE, now());
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 1, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Yrsa');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-yrsa@example.invalid', 'Yrsa', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Yrsa jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 2, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('Toma');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, 'seed-toma@example.invalid', 'Toma', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz Toma jest już w drużynie w tym turnieju';
            END IF;
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, 3, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;
            RAISE NOTICE 'Dodano drużynę Synowie Burzy: Halvar, Yrsa, Toma (kapitan: Halvar)';
        END IF;
    END IF;
END $$;
