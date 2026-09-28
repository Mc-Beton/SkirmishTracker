package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Big points deducted by the organizer (positive number = points taken away). */
@Entity
@Table(name = "tournament_penalties")
public class TournamentPenalty extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "big_points", nullable = false)
    private int bigPoints;

    @Column(nullable = false, length = 300)
    private String reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TournamentPenalty() {
    }

    public TournamentPenalty(UUID tournamentId, UUID userId, int bigPoints, String reason, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.userId = userId;
        this.bigPoints = bigPoints;
        this.reason = reason;
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getBigPoints() {
        return bigPoints;
    }

    public String getReason() {
        return reason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
