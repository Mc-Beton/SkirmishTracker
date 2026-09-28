-- Optional warband lists of both players in own games (JSON, validated by FriendlyGameService)

ALTER TABLE friendly_games ADD COLUMN list_a TEXT;
ALTER TABLE friendly_games ADD COLUMN list_b TEXT;
