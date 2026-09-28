package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** A player's list for one tournament. Units are stored as a JSON array (validated by WarbandService). */
@Entity
@Table(name = "warbands")
public class Warband extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 60)
    private String faction;

    @Column(name = "allied_faction", length = 60)
    private String alliedFaction;

    @Column(name = "leader_int", nullable = false)
    private int leaderInt;

    @Column(name = "total_points", nullable = false)
    private int totalPoints;

    /** JSON; size is bounded by WarbandService (units × items), stored as TEXT. */
    @Column(nullable = false, columnDefinition = "text")
    private String units;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected Warband() {
    }

    public Warband(UUID tournamentId, UUID userId) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.userId = userId;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void update(String faction, String alliedFaction, int leaderInt, int totalPoints, String unitsJson) {
        this.faction = faction;
        this.alliedFaction = alliedFaction;
        this.leaderInt = leaderInt;
        this.totalPoints = totalPoints;
        this.units = unitsJson;
        this.updatedAt = Instant.now();
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

    public String getFaction() {
        return faction;
    }

    public String getAlliedFaction() {
        return alliedFaction;
    }

    public int getLeaderInt() {
        return leaderInt;
    }

    public int getTotalPoints() {
        return totalPoints;
    }

    public String getUnits() {
        return units;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
