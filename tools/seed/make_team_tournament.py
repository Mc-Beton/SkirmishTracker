from argon2 import PasswordHasher, Type
ph=PasswordHasher(time_cost=2, memory_cost=16384, parallelism=1, hash_len=32, salt_len=16, type=Type.ID)
h=ph.hash('DruzynyTest2026')
teams=[("Stalowa Straż",["Borvin","Ingrid","Tassel"]),
       ("Nocne Sowy",["Morwen","Kestrel","Arlo"]),
       ("Czerwone Smoki",["Rurik","Selka","Oden"]),
       ("Gildia Kupców",["Varro","Linnea","Pip"]),
       ("Synowie Burzy",["Halvar","Yrsa","Toma"])]
L=["""-- Test data only (local development). Adds 5 complete teams of 3 to a team tournament.
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
    pwd    TEXT := '@HASH@';
BEGIN
    SELECT id, max_players INTO tid, tmax FROM tournaments
     WHERE team_size = 3 AND status IN ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED')
       AND (tname = '' OR lower(name) = lower(tname))
     ORDER BY created_at DESC LIMIT 1;
    IF tid IS NULL THEN
        RAISE EXCEPTION 'Nie znaleziono otwartego turnieju drużynowego (3 graczy) %', tname;
    END IF;
    RAISE NOTICE 'Turniej: % (%)', (SELECT name FROM tournaments WHERE id = tid), tid;
""".replace('@HASH@',h)]
for name,nicks in teams:
    L.append(f"""
    -- {name}
    IF EXISTS (SELECT 1 FROM teams WHERE tournament_id = tid AND lower(name) = lower('{name}')) THEN
        RAISE NOTICE 'Drużyna {name} już istnieje – pomijam';
    ELSE
        SELECT count(*) INTO taken FROM teams WHERE tournament_id = tid;
        IF tmax IS NOT NULL AND taken >= tmax THEN
            RAISE NOTICE 'Limit drużyn osiągnięty – pomijam {name}';
        ELSE""")
    for i,n in enumerate(nicks):
        mail=f"seed-{n.lower()}@example.invalid"
        L.append(f"""
            SELECT id INTO u FROM users WHERE lower(display_name) = lower('{n}');
            IF u IS NULL THEN
                u := gen_random_uuid();
                INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, created_at, updated_at)
                VALUES (u, '{mail}', '{n}', pwd, now(), 'pl', now(), now());
                INSERT INTO user_roles (user_id, role) VALUES (u, 'USER');
            END IF;
            IF EXISTS (SELECT 1 FROM team_members WHERE tournament_id = tid AND user_id = u AND status = 'ACCEPTED') THEN
                RAISE EXCEPTION 'Gracz {n} jest już w drużynie w tym turnieju';
            END IF;""")
        if i==0:
            L.append(f"""
            team := gen_random_uuid();
            INSERT INTO teams (id, tournament_id, name, captain_id, dropped, created_at)
            VALUES (team, tid, '{name}', u, FALSE, now());""")
        L.append(f"""
            DELETE FROM team_members WHERE tournament_id = tid AND user_id = u;
            INSERT INTO team_members (id, team_id, tournament_id, user_id, position, status, created_at)
            VALUES (gen_random_uuid(), team, tid, u, {i+1}, 'ACCEPTED', now());
            INSERT INTO tournament_participants (id, tournament_id, user_id, status, registered_at, paid, list_status, dropped)
            VALUES (gen_random_uuid(), tid, u, 'REGISTERED', now(), FALSE, 'NOT_SUBMITTED', FALSE)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;""")
    L.append(f"""
            RAISE NOTICE 'Dodano drużynę {name}: {", ".join(nicks)} (kapitan: {nicks[0]})';
        END IF;
    END IF;
""")
L.append("END $$;\n")
open('/home/claude/skirmish/tools/seed/team_tournament.sql','w').write(''.join(L))
