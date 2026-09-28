package com.skirmishchronicle.league;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "league_members")
public class LeagueMember extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "league_id", nullable = false)
    private UUID leagueId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected LeagueMember() {
    }

    public LeagueMember(UUID leagueId, UUID userId) {
        this.id = UUID.randomUUID();
        this.leagueId = leagueId;
        this.userId = userId;
        this.joinedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getLeagueId() {
        return leagueId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
