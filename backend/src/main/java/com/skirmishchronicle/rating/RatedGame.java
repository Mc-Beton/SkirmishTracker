package com.skirmishchronicle.rating;

import com.skirmishchronicle.common.GameSystem;
import java.time.Instant;
import java.util.UUID;

/**
 * One played game that counts for ELO: a confirmed tournament match or a confirmed own game.
 * {@code tournamentId} is set for tournament games, {@code leagueId} for own games reported for a league.
 * {@code secondaryA}/{@code secondaryB}: second score slot (Bolt Action secondaries, break a scenario tie).
 */
public record RatedGame(UUID id, UUID playerA, UUID playerB, int smallA, int smallB, Instant playedAt,
                        UUID tournamentId, UUID leagueId, Integer secondaryA, Integer secondaryB,
                        GameSystem system) {

    /** Eldfall game without a second score slot. */
    public RatedGame(UUID id, UUID playerA, UUID playerB, int smallA, int smallB, Instant playedAt,
                     UUID tournamentId, UUID leagueId) {
        this(id, playerA, playerB, smallA, smallB, playedAt, tournamentId, leagueId, null, null, GameSystem.ELDFALL);
    }

    /** 1 = A won, 0.5 = draw, 0 = B won. */
    public double scoreA() {
        int c = Integer.compare(smallA, smallB);
        if (c == 0 && secondaryA != null && secondaryB != null) {
            c = Integer.compare(secondaryA, secondaryB);
        }
        return c > 0 ? 1.0 : c == 0 ? 0.5 : 0.0;
    }
}
