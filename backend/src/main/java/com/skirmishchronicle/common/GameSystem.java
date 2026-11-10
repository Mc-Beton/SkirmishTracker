package com.skirmishchronicle.common;

/**
 * Game system of a tournament, a league or a rated game. Eldfall Chronicles is the original system (all
 * information modules, warband validation, online play); Bolt Action has tournaments, leagues and its own ELO.
 */
public enum GameSystem {
    ELDFALL,
    BOLT_ACTION;

    /** Request parameter → system; missing or unknown values mean Eldfall (older clients). */
    public static GameSystem parse(String value) {
        if (value == null || value.isBlank()) {
            return ELDFALL;
        }
        for (GameSystem s : values()) {
            if (s.name().equalsIgnoreCase(value.trim())) {
                return s;
            }
        }
        return ELDFALL;
    }
}
