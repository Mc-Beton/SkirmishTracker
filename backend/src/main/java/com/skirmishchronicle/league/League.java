package com.skirmishchronicle.league;

import com.skirmishchronicle.common.AbstractEntity;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/** A league season: tournaments (accepted by the owner) and own games of its members make up one table. */
@Entity
@Table(name = "leagues")
public class League extends AbstractEntity {

    /** Editable settings. {@code placePoints}: points for 1st, 2nd, … place. */
    public record Settings(String name, String description, String city, LocalDate startsOn, LocalDate endsOn,
                           LeagueScoringMode scoringMode, boolean ownGamesAllowed, List<Integer> placePoints,
                           int participationPoints, BigDecimal multiplierLocal, BigDecimal multiplierMaster,
                           BigDecimal multiplierInternational, BigDecimal bigPointsMultiplier, int gameWinPoints,
                           int gameDrawPoints, int gameLossPoints) {
    }

    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 4000)
    private String description;

    @Column(length = 80)
    private String city;

    @Column(name = "starts_on", nullable = false)
    private LocalDate startsOn;

    @Column(name = "ends_on", nullable = false)
    private LocalDate endsOn;

    @Enumerated(EnumType.STRING)
    @Column(name = "scoring_mode", nullable = false, length = 30)
    private LeagueScoringMode scoringMode;

    @Column(name = "own_games_allowed", nullable = false)
    private boolean ownGamesAllowed = true;

    @Column(name = "place_points", nullable = false, length = 400)
    private String placePoints = "10,8,6,5,4,3,2,1";

    @Column(name = "participation_points", nullable = false)
    private int participationPoints = 1;

    @Column(name = "multiplier_local", nullable = false, precision = 5, scale = 2)
    private BigDecimal multiplierLocal = BigDecimal.ONE;

    @Column(name = "multiplier_master", nullable = false, precision = 5, scale = 2)
    private BigDecimal multiplierMaster = new BigDecimal("1.5");

    @Column(name = "multiplier_international", nullable = false, precision = 5, scale = 2)
    private BigDecimal multiplierInternational = new BigDecimal("2");

    @Column(name = "big_points_multiplier", nullable = false, precision = 5, scale = 2)
    private BigDecimal bigPointsMultiplier = BigDecimal.ONE;

    @Column(name = "game_win_points", nullable = false)
    private int gameWinPoints = 3;

    @Column(name = "game_draw_points", nullable = false)
    private int gameDrawPoints = 1;

    @Column(name = "game_loss_points", nullable = false)
    private int gameLossPoints;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected League() {
    }

    public League(UUID ownerId) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
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

    public void update(Settings s) {
        this.name = s.name().trim();
        this.description = s.description();
        this.city = s.city();
        this.startsOn = s.startsOn();
        this.endsOn = s.endsOn();
        this.scoringMode = s.scoringMode();
        // Place points are tournament-only, so own games make no sense in that mode.
        this.ownGamesAllowed = s.ownGamesAllowed() && s.scoringMode() != LeagueScoringMode.PLACE_POINTS;
        this.placePoints = String.join(",", s.placePoints().stream().map(String::valueOf).toList());
        this.participationPoints = s.participationPoints();
        this.multiplierLocal = s.multiplierLocal();
        this.multiplierMaster = s.multiplierMaster();
        this.multiplierInternational = s.multiplierInternational();
        this.bigPointsMultiplier = s.bigPointsMultiplier();
        this.gameWinPoints = s.gameWinPoints();
        this.gameDrawPoints = s.gameDrawPoints();
        this.gameLossPoints = s.gameLossPoints();
    }

    public Settings settings() {
        return new Settings(name, description, city, startsOn, endsOn, scoringMode, ownGamesAllowed, placePointList(),
                participationPoints, multiplierLocal, multiplierMaster, multiplierInternational, bigPointsMultiplier,
                gameWinPoints, gameDrawPoints, gameLossPoints);
    }

    public List<Integer> placePointList() {
        if (placePoints == null || placePoints.isBlank()) {
            return List.of();
        }
        return Arrays.stream(placePoints.split(",")).map(String::trim).map(Integer::valueOf).toList();
    }

    public BigDecimal multiplierFor(TournamentRank rank) {
        return switch (rank) {
            case LOCAL -> multiplierLocal;
            case MASTER -> multiplierMaster;
            case INTERNATIONAL -> multiplierInternational;
        };
    }

    public boolean isOwnedBy(UUID userId) {
        return ownerId.equals(userId);
    }

    public boolean covers(LocalDate day) {
        return !day.isBefore(startsOn) && !day.isAfter(endsOn);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public String getCity() {
        return city;
    }

    public LocalDate getStartsOn() {
        return startsOn;
    }

    public LocalDate getEndsOn() {
        return endsOn;
    }

    public LeagueScoringMode getScoringMode() {
        return scoringMode;
    }

    public boolean isOwnGamesAllowed() {
        return ownGamesAllowed;
    }

    public BigDecimal getBigPointsMultiplier() {
        return bigPointsMultiplier;
    }

    public int getParticipationPoints() {
        return participationPoints;
    }

    public int getGameWinPoints() {
        return gameWinPoints;
    }

    public int getGameDrawPoints() {
        return gameDrawPoints;
    }

    public int getGameLossPoints() {
        return gameLossPoints;
    }
}
