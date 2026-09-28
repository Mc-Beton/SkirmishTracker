package com.skirmishchronicle.tournament.domain;

public enum ScoringMode {
    /** Fixed big points for a win / draw / loss (e.g. 3/1/0). */
    WIN_DRAW_LOSS,
    /** Big points = small points × multiplier (e.g. 8:2 → 16:4). */
    SMALL_POINTS_MULTIPLIER,
    /** Big points from a table of small-point differences (e.g. up to 2 → 11:9). */
    DIFFERENCE_TABLE
}
