package com.skirmishchronicle.league;

public enum LeagueScoringMode {
    /** Points for the final place in each tournament (table) times the multiplier of the tournament's rank. */
    PLACE_POINTS,
    /**
     * Big points earned in tournaments (after penalties) times the multiplier of the tournament rank;
     * own games: W/D/L points times the own-game multiplier ({@code bigPointsMultiplier}).
     */
    BIG_POINTS,
    /** A league-only ELO from 1500 over the league's games. */
    ELO
}
