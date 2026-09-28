package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.domain.RoundPairing;
import com.skirmishchronicle.tournament.domain.TableOrder;
import com.skirmishchronicle.tournament.domain.ListStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Read models returned by the tournament API. */
public final class TournamentViews {

    private TournamentViews() {
    }

    public record Organizer(UUID id, String displayName) {
    }

    public record Summary(UUID id, String name, Instant startsAt, String city, String venueName,
                          TournamentRank rank, TournamentFormat format, TournamentStatus status,
                          Integer maxPlayers, long registeredCount, Integer pointsLimit, String organizerName) {
    }

    public record Detail(UUID id, String name, String description, Instant startsAt, Instant endsAt,
                         String venueName, String address, String city, String country,
                         BigDecimal entryFeeAmount, String entryFeeCurrency, TournamentRank rank,
                         TournamentFormat format, Integer maxPlayers, Integer pointsLimit, Integer roundsPlanned,
                         Instant listDeadline, TournamentStatus status, Organizer organizer,
                         long registeredCount, long waitlistCount,
                         /** Caller's registration: null, REGISTERED or WAITLIST. */
                         ParticipantStatus myStatus,
                         boolean canManage,
                         TournamentSettings settings,
                         long roundsCount,
                         List<RoundPlan> roundPlans) {
    }

    /** pairing / softPreferences null = default for that round. */
    public record RoundPlan(int number, String scenarioCode, RoundPairing pairing, TableOrder tableOrder,
                            Boolean softPreferences, Integer durationMinutes) {
    }

    /** paid/listStatus are only filled in for the organizer. */
    public record Participant(UUID id, UUID userId, String displayName, ParticipantStatus status,
                              Instant registeredAt, Boolean paid, ListStatus listStatus, String club, String city,
                              boolean dropped) {
    }

    public record AuditItem(Instant at, String actorName, String action, String details) {
    }

    public record MyTournaments(List<Summary> organized, List<Summary> joined) {
    }

    public record Page<T>(List<T> items, int page, int size, long total) {
    }
}
