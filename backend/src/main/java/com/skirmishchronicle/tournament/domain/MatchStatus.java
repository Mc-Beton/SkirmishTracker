package com.skirmishchronicle.tournament.domain;

public enum MatchStatus {
    /** No result yet. */
    PENDING,
    /** One player entered the score; waiting for the opponent. */
    REPORTED,
    /** Opponent disagrees; the organizer decides. */
    DISPUTED,
    /** Final: counts in the standings. */
    CONFIRMED
}
