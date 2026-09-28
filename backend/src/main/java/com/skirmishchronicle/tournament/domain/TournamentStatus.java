package com.skirmishchronicle.tournament.domain;

public enum TournamentStatus {
    /** Visible only to the organizer. */
    DRAFT,
    /** Public, registration open. */
    PUBLISHED,
    /** Public, registration closed by the organizer. */
    REGISTRATION_CLOSED,
    IN_PROGRESS,
    FINISHED,
    CANCELLED;

    public boolean isPublic() {
        return this != DRAFT;
    }

    /** States in which the player list may still change. */
    public boolean acceptsRosterChanges() {
        return this == DRAFT || this == PUBLISHED || this == REGISTRATION_CLOSED;
    }
}
