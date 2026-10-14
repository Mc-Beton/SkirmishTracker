-- Online tables: besides the invitation link, the creator can invite a registered player by name. The invited player
-- gets a notification and may accept (with one of their lists) or decline. One invited player at a time.
ALTER TABLE game_tables ADD COLUMN invited_user_id UUID REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX ix_game_tables_invited_user ON game_tables (invited_user_id) WHERE invited_user_id IS NOT NULL;
