package com.skirmishchronicle.pairing;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Inputs and outputs of the pairing engine (framework-free, unit-testable). */
public final class PairingModels {

    private PairingModels() {
    }

    public enum FirstRoundMode {
        RANDOM,
        /** 1v2, 3v4… by league ELO. */
        ELO_STRONG_VS_STRONG,
        /** Top half vs bottom half by league ELO: with 8 players 1v5, 2v6, 3v7, 4v8. */
        ELO_TOP_VS_BOTTOM
    }

    /** Soft preferences: satisfied only when the Swiss rules allow it. Priority club > faction > city. */
    public record SoftPreferences(boolean avoidSameClub, boolean avoidSameFaction, boolean avoidSameCity) {
        public static final SoftPreferences NONE = new SoftPreferences(false, false, false);

        public boolean any() {
            return avoidSameClub || avoidSameFaction || avoidSameCity;
        }
    }

    public record Player(UUID id, int wins, int bigPoints, int smallPoints, Set<UUID> previousOpponents,
                         boolean hadBye, String club, String faction, String city, Integer elo) {
    }

    public record Pair(UUID playerA, UUID playerB) {
    }

    /** bye is null when the number of players is even. */
    public record Result(List<Pair> pairs, UUID bye) {
    }

    /** No pairing satisfies the hard rules (e.g. more rounds than possible opponents). */
    public static class NoValidPairingException extends RuntimeException {
        public NoValidPairingException(String message) {
            super(message);
        }
    }
}
