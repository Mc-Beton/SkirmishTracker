package com.skirmishchronicle.analytics;

import com.skirmishchronicle.rating.Elo;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/**
 * One player's side of a rated game – the unit every meta statistic is computed from. A game gives two facts.
 * {@code elo} / {@code opponentElo} are the ratings right before the game; faction, units and mission may be
 * unknown (null / empty) when the game was reported without them.
 */
public record SideFact(UUID gameId, UUID playerId, UUID opponentId, LocalDate playedOn, Source source,
                       UUID tournamentId, String country, String tier, String faction, String opponentFaction,
                       Set<String> units, String mission, double elo, double opponentElo, double score, int vpFor,
                       int vpAgainst) {

    public enum Source {
        TOURNAMENT,
        OWN
    }

    /** Score the ELO ratings predicted for this side (0–1). */
    public double expected() {
        return Elo.expected(elo, opponentElo);
    }

    public boolean mirror() {
        return faction != null && faction.equals(opponentFaction);
    }
}
