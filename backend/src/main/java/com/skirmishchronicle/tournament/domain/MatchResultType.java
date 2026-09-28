package com.skirmishchronicle.tournament.domain;

public enum MatchResultType {
    PLAYED,
    /** Draw agreed without playing; points from the tournament's SPLIT settings. */
    SPLIT,
    BYE
}
