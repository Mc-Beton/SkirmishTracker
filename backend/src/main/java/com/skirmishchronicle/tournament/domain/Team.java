package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "teams")
public class Team extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "captain_id", nullable = false)
    private UUID captainId;

    @Column
    private Integer seed;

    @Column(nullable = false)
    private boolean dropped;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Team() {
    }

    public Team(UUID tournamentId, String name, UUID captainId) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.name = name.trim();
        this.captainId = captainId;
        this.createdAt = Instant.now();
    }

    public void rename(String name) {
        this.name = name.trim();
    }

    public void setCaptain(UUID captainId) {
        this.captainId = captainId;
    }

    public void setSeed(Integer seed) {
        this.seed = seed;
    }

    public void drop() {
        this.dropped = true;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public String getName() {
        return name;
    }

    public UUID getCaptainId() {
        return captainId;
    }

    public Integer getSeed() {
        return seed;
    }

    public boolean isDropped() {
        return dropped;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
