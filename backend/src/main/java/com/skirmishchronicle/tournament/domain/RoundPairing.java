package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;

/** Pairing method of one Swiss round, chosen in the round plan. */
public enum RoundPairing {
    /** By results (wins → big → small points), no rematches. In round 1 the same as random. */
    SWISS,
    /** Random, no rematches. */
    RANDOM,
    /** Neighbours by global ELO, no rematches. */
    ELO_STRONG_VS_STRONG,
    /** Top half vs bottom half by global ELO, no rematches. */
    ELO_TOP_VS_BOTTOM;

    public FirstRoundMode asMode() {
        return switch (this) {
            case SWISS, RANDOM -> FirstRoundMode.RANDOM;
            case ELO_STRONG_VS_STRONG -> FirstRoundMode.ELO_STRONG_VS_STRONG;
            case ELO_TOP_VS_BOTTOM -> FirstRoundMode.ELO_TOP_VS_BOTTOM;
        };
    }

    public static RoundPairing of(FirstRoundMode mode) {
        return switch (mode) {
            case RANDOM -> RANDOM;
            case ELO_STRONG_VS_STRONG -> ELO_STRONG_VS_STRONG;
            case ELO_TOP_VS_BOTTOM -> ELO_TOP_VS_BOTTOM;
        };
    }
}
