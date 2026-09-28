package com.skirmishchronicle.rating;

import java.time.Instant;
import java.util.UUID;

/**
 * One played game that counts for ELO: a confirmed tournament match or a confirmed own game.
 * {@code tournamentId} is set for tournament games, {@code leagueId} for own games reported for a league.
 */
public record RatedGame(UUID id, UUID playerA, UUID playerB, int smallA, int smallB, Instant playedAt,
                        UUID tournamentId, UUID leagueId) {

    /** 1 = A won, 0.5 = draw, 0 = B won. */
    public double scoreA() {
        return smallA > smallB ? 1.0 : smallA == smallB ? 0.5 : 0.0;
    }
}
