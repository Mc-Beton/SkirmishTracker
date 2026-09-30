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
        Instant listDeadline,
        /** CLASSIC (one list) or ROSTER; with ROSTER, {@code pointsLimit} is the roster limit. */
        ListFormat listFormat,
        /** Points of the party picked from the roster for each game (ROSTER only). */
        Integer partyLimit,
        /** ROSTER: opponents do not see each other's roster (only the organizer does) until the event ends. */
        boolean hiddenRosters) {
}
