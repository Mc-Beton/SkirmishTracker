-- Co-organizers (organizer / judge): manage the tournament like its owner; only the owner edits this list.
CREATE TABLE tournament_organizers (
    tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users (id),
    PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX ix_tournament_organizers_user ON tournament_organizers (user_id);
