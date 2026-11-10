package com.skirmishchronicle.tournament.domain;

/** When other players may see the submitted lists (the organizer and the owner always can). */
public enum ListVisibility {
    /** Once the list deadline passes or the tournament starts (Eldfall behaviour). */
    AFTER_DEADLINE,
    /** Once the first round's pairings are published. */
    AFTER_FIRST_PAIRINGS,
    /** Always. */
    PUBLIC,
    /** Never (organizer only). */
    HIDDEN
}
