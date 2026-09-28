package com.skirmishchronicle.tournament.domain;

/** Kind of round: Swiss pairing, fixed round-robin schedule or a knockout bracket round. */
public enum RoundPhase {
    SWISS,
    ROUND_ROBIN,
    KNOCKOUT
}
