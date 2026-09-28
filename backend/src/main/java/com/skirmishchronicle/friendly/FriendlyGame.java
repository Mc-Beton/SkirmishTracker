package com.skirmishchronicle.friendly;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A game outside tournaments. Counts for ELO (and optionally one league) once the opponent confirms it. */
@Entity
@Table(name = "friendly_games")
public class FriendlyGame extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "player_a", nullable = false)
    private UUID playerA;

    @Column(name = "player_b", nullable = false)
    private UUID playerB;

    @Column(name = "small_a", nullable = false)
    private int smallA;

    @Column(name = "small_b", nullable = false)
    private int smallB;

    @Column(name = "played_on", nullable = false)
    private LocalDate playedOn;

    @Column(name = "scenario_code", length = 60)
    private String scenarioCode;

    @Column(name = "faction_a", length = 60)
    private String factionA;

    @Column(name = "faction_b", length = 60)
    private String factionB;

    @Column(name = "league_id")
    private UUID leagueId;

    @Column(length = 500)
    private String notes;

    /** Optional warband lists (JSON {@link GameList}). */
    @Column(name = "list_a", columnDefinition = "text")
    private String listA;

    @Column(name = "list_b", columnDefinition = "text")
    private String listB;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FriendlyGameStatus status = FriendlyGameStatus.PENDING;

    @Column(name = "reported_by", nullable = false)
    private UUID reportedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Version
    private Long version;

    protected FriendlyGame() {
    }

    /** The reporter is always player A. */
    public FriendlyGame(UUID reporter, UUID opponent, int reporterScore, int opponentScore, LocalDate playedOn,
                        String scenarioCode, String reporterFaction, String opponentFaction, UUID leagueId,
                        String notes) {
        this.id = UUID.randomUUID();
        this.playerA = reporter;
        this.playerB = opponent;
        this.smallA = reporterScore;
        this.smallB = opponentScore;
        this.playedOn = playedOn;
        this.scenarioCode = scenarioCode;
        this.factionA = reporterFaction;
        this.factionB = opponentFaction;
        this.leagueId = leagueId;
        this.notes = notes;
        this.reportedBy = reporter;
        this.createdAt = Instant.now();
    }

    public void setLists(String listA, String listB) {
        this.listA = listA;
        this.listB = listB;
    }

    public String getListA() {
        return listA;
    }

    public String getListB() {
        return listB;
    }

    public void decide(boolean confirmed) {
        this.status = confirmed ? FriendlyGameStatus.CONFIRMED : FriendlyGameStatus.REJECTED;
        this.decidedAt = Instant.now();
    }

    public boolean involves(UUID userId) {
        return playerA.equals(userId) || playerB.equals(userId);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getPlayerA() {
        return playerA;
    }

    public UUID getPlayerB() {
        return playerB;
    }

    public int getSmallA() {
        return smallA;
    }

    public int getSmallB() {
        return smallB;
    }

    public LocalDate getPlayedOn() {
        return playedOn;
    }

    public String getScenarioCode() {
        return scenarioCode;
    }

    public String getFactionA() {
        return factionA;
    }

    public String getFactionB() {
        return factionB;
    }

    public UUID getLeagueId() {
        return leagueId;
    }

    public String getNotes() {
        return notes;
    }

    public FriendlyGameStatus getStatus() {
        return status;
    }

    public UUID getReportedBy() {
        return reportedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
