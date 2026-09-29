package com.skirmishchronicle.analytics;

import com.skirmishchronicle.rating.Elo;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * One player's side of a rated game – the unit every meta statistic is computed from. A game gives two facts.
 * {@code elo} / {@code opponentElo} are the ratings right before the game; faction, units and mission may be
 * unknown (null / empty) when the game was reported without them. {@code items} lists every item bought in the
 * list (one entry per copy); {@code unitPoints} / {@code itemPoints} split the list's cost.
 */
public record SideFact(UUID gameId, UUID playerId, UUID opponentId, LocalDate playedOn, Source source,
                       UUID tournamentId, String country, String tier, String faction, String opponentFaction,
                       Set<String> units, String mission, double elo, double opponentElo, double score, int vpFor,
                       int vpAgainst, List<ItemUse> items, int unitPoints, int itemPoints) {

    /** One item bought for a character: at its reduced (conditional) cost or not, on the leader or not. */
    public record ItemUse(String item, String unit, boolean leader, boolean reduced) {
    }

    /** A side without item data (lists without items, older reports). */
    public SideFact(UUID gameId, UUID playerId, UUID opponentId, LocalDate playedOn, Source source, UUID tournamentId,
                    String country, String tier, String faction, String opponentFaction, Set<String> units,
                    String mission, double elo, double opponentElo, double score, int vpFor, int vpAgainst) {
        this(gameId, playerId, opponentId, playedOn, source, tournamentId, country, tier, faction, opponentFaction,
                units, mission, elo, opponentElo, score, vpFor, vpAgainst, List.of(), 0, 0);
    }

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
