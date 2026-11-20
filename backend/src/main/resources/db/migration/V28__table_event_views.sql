-- Hidden information on the online table (game engine): an event that would give away a Shrouded model is stored
-- in up to three more forms – what player A, player B and anybody else (observer, judge, admin) is sent instead of
-- it. NULL: that viewer gets the event itself. The rules service writes them (rules/service.ts, `views`).
ALTER TABLE table_events ADD COLUMN payload_a TEXT;
ALTER TABLE table_events ADD COLUMN payload_b TEXT;
ALTER TABLE table_events ADD COLUMN payload_public TEXT;
