package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Victory points one player scored in one turn of a game (scenario and scheme separately). */
@Entity
@Table(name = "match_turn_scores")
public class MatchTurnScore extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "match_id", nullable = false)
    private UUID matchId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private int turn;

    @Column(name = "scenario_vp", nullable = false)
    private int scenarioVp;

    @Column(name = "scheme_vp", nullable = false)
    private int schemeVp;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by", nullable = false)
    private UUID updatedBy;

    protected MatchTurnScore() {
    }

    public MatchTurnScore(UUID matchId, UUID userId, int turn) {
        this.id = UUID.randomUUID();
        this.matchId = matchId;
        this.userId = userId;
        this.turn = turn;
    }

    public void set(int scenarioVp, int schemeVp, UUID by) {
        this.scenarioVp = scenarioVp;
        this.schemeVp = schemeVp;
        this.updatedBy = by;
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

    public int getTurn() {
        return turn;
    }

    public int getScenarioVp() {
        return scenarioVp;
    }

    public int getSchemeVp() {
        return schemeVp;
    }
}
