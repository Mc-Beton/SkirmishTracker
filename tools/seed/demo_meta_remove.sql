-- Removes the DEMO data created by tools/seed/demo_meta.sql.
BEGIN;
DELETE FROM seasons WHERE name LIKE '[DEMO]%';
DELETE FROM tournaments WHERE name LIKE '[DEMO]%';
DELETE FROM friendly_games WHERE notes = '[demo]'
    OR player_a IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid')
    OR player_b IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid');
DELETE FROM league_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid');
DELETE FROM users WHERE email LIKE 'demo-%@example.invalid';
COMMIT;
