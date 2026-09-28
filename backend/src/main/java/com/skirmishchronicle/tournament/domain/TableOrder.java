package com.skirmishchronicle.tournament.domain;

/** How pairs are placed on tables. The BYE never takes a table and is listed last. */
public enum TableOrder {
    /** Tables in random order. */
    RANDOM,
    /** The pair with the best-placed player (standings: wins → big → small points) at table 1, and so on. */
    BY_STANDINGS
}
