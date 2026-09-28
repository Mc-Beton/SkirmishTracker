-- Test data only (local development). Fills in random confirmed results for every unfinished game
-- of the round in progress of one tournament, so the next round can be paired.
-- Run: docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/round_results.sql
DO $$
DECLARE
    tid   UUID := 'eff3b42e-055b-48c9-a405-4ab78cbf5145';  -- tournament to fill in
    rid   UUID;
    rnum  INT;
    n     INT;
BEGIN
    SELECT id, number INTO rid, rnum FROM tournament_rounds
     WHERE tournament_id = tid AND status = 'IN_PROGRESS' ORDER BY number DESC LIMIT 1;
    IF rid IS NULL THEN
        RAISE EXCEPTION 'Turniej nie ma rundy w trakcie – najpierw wystartuj rundę.';
    END IF;
    -- Small points 0–15 per player; about one game in ten ends level.
    UPDATE tournament_matches m
       SET result_type = 'PLAYED',
           small_a = s.a,
           small_b = CASE WHEN random() < 0.1 THEN s.a ELSE s.b END,
           status = 'CONFIRMED',
           reported_by = m.player_a, reported_at = now(),
           confirmed_by = m.player_b, confirmed_at = now(),
           version = m.version + 1
      FROM (SELECT id, floor(random() * 16)::int AS a, floor(random() * 16)::int AS b
              FROM tournament_matches WHERE round_id = rid) s
     WHERE m.id = s.id AND m.round_id = rid AND m.player_b IS NOT NULL AND m.status <> 'CONFIRMED';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Runda %: wpisano % wyników. Teraz w panelu organizatora: „Zakończ rundę”, potem „Generuj rundę %”.',
        rnum, n, rnum + 1;
END $$;
