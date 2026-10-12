package com.skirmishchronicle.friendly;

public enum FriendlyGameStatus {
    /** Being played in the app: both players enter points turn by turn; does not count yet. */
    IN_PROGRESS,
    /** Reported (or finished) by one player, waiting for the opponent. */
    PENDING,
    CONFIRMED,
    REJECTED
}
