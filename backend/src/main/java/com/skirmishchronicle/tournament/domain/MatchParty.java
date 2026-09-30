package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * Roster format: the party one player fields in one game – roster entries (by index, with the upgrades kept)
 * and the leader's INT for the scheme draw. Hidden from the opponent until the game is over.
 */
@Entity
@Table(name = "match_parties")
public class MatchParty extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "match_id", nullable = false)
    private UUID matchId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** JSON: [{slot, unit, extraPoints, leader, items: [{item, reduced}], itemIndexes: [..]}]. */
    @Column(nullable = false, columnDefinition = "text")
    private String units;

    @Column(name = "leader_int", nullable = false)
    private int leaderInt;

    @Column(name = "total_points", nullable = false)
    private int totalPoints;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected MatchParty() {
    }

    public MatchParty(UUID matchId, UUID userId) {
        this.id = UUID.randomUUID();
        this.matchId = matchId;
        this.userId = userId;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void update(String unitsJson, int leaderInt, int totalPoints) {
        this.units = unitsJson;
        this.leaderInt = leaderInt;
        this.totalPoints = totalPoints;
        this.updatedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getMatchId() {
        return matchId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getUnits() {
        return units;
    }

    public int getLeaderInt() {
        return leaderInt;
    }

    public int getTotalPoints() {
        return totalPoints;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
