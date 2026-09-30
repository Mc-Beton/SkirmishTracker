package com.skirmishchronicle.tournament.domain;

/**
 * How warband lists work in a tournament. CLASSIC: one list used for every game. ROSTER: a larger roster
 * submitted before the event, and a party picked from it for every game (Eldfall competitive Season 2).
 */
public enum ListFormat {
    CLASSIC,
    ROSTER
}
