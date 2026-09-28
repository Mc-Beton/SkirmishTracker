package com.skirmishchronicle.league;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A tournament submitted to a league by its organizer; counts once the league owner accepts it. */
@Entity
@Table(name = "league_tournaments")
public class LeagueTournament extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "league_id", nullable = false)
    private UUID leagueId;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LeagueTournamentStatus status = LeagueTournamentStatus.PENDING;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected LeagueTournament() {
    }

    public LeagueTournament(UUID leagueId, UUID tournamentId, UUID requestedBy) {
        this.id = UUID.randomUUID();
        this.leagueId = leagueId;
        this.tournamentId = tournamentId;
        this.requestedBy = requestedBy;
        this.requestedAt = Instant.now();
    }

    public void decide(LeagueTournamentStatus status) {
        this.status = status;
        this.decidedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getLeagueId() {
        return leagueId;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public LeagueTournamentStatus getStatus() {
        return status;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }
}
