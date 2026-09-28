package com.skirmishchronicle.tournament.domain;

import java.math.BigDecimal;
import java.time.Instant;

/** Organizer-editable tournament details (already validated by the web layer). */
public record TournamentDetails(
        String name,
        String description,
        Instant startsAt,
        Instant endsAt,
        String venueName,
        String address,
        String city,
        String country,
        BigDecimal entryFeeAmount,
        String entryFeeCurrency,
        TournamentRank rank,
        TournamentFormat format,
        Integer maxPlayers,
        Integer pointsLimit,
        Integer roundsPlanned,
        Instant listDeadline) {
}
