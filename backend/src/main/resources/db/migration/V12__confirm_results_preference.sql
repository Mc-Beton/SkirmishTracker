-- Player preference: confirm results entered by the opponent (default: no – the opponent's result is final).
ALTER TABLE users ADD COLUMN confirm_results BOOLEAN NOT NULL DEFAULT FALSE;
