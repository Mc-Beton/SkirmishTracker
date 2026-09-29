package com.skirmishchronicle.season;

import com.skirmishchronicle.common.AbstractEntity;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * An official season: finished official tournaments starting within [startsOn, endsOn] earn ranking points –
 * the tier's base points scaled by the place, the best {@code bestResults} results of each player count.
 */
@Entity
@Table(name = "seasons")
public class Season extends AbstractEntity {

    public record Settings(String name, LocalDate startsOn, LocalDate endsOn, int pointsLocal, int pointsMaster,
                           int pointsInternational, int bestResults) {
    }

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "starts_on", nullable = false)
    private LocalDate startsOn;

    @Column(name = "ends_on", nullable = false)
    private LocalDate endsOn;

    @Column(name = "points_local", nullable = false)
    private int pointsLocal;

    @Column(name = "points_master", nullable = false)
    private int pointsMaster;

    @Column(name = "points_international", nullable = false)
    private int pointsInternational;

    @Column(name = "best_results", nullable = false)
    private int bestResults;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected Season() {
    }

    public Season(Settings s) {
        this.id = UUID.randomUUID();
        this.createdAt = Instant.now();
        apply(s);
    }

    public void apply(Settings s) {
        this.name = s.name();
        this.startsOn = s.startsOn();
        this.endsOn = s.endsOn();
        this.pointsLocal = s.pointsLocal();
        this.pointsMaster = s.pointsMaster();
        this.pointsInternational = s.pointsInternational();
        this.bestResults = s.bestResults();
        this.updatedAt = Instant.now();
    }

    public int basePoints(TournamentRank rank) {
        return switch (rank) {
            case LOCAL -> pointsLocal;
            case MASTER -> pointsMaster;
            case INTERNATIONAL -> pointsInternational;
        };
    }

    public Settings settings() {
        return new Settings(name, startsOn, endsOn, pointsLocal, pointsMaster, pointsInternational, bestResults);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public LocalDate getStartsOn() {
        return startsOn;
    }

    public LocalDate getEndsOn() {
        return endsOn;
    }

    public int getBestResults() {
        return bestResults;
    }
}
