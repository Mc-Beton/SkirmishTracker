package com.skirmishchronicle.friendly;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Victory points one player scored in one turn of an own game played in the app (scenario and scheme). */
@Entity
@Table(name = "friendly_turn_scores")
public class FriendlyTurnScore extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "game_id", nullable = false)
    private UUID gameId;

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

    protected FriendlyTurnScore() {
    }

    public FriendlyTurnScore(UUID gameId, UUID userId, int turn) {
        this.id = UUID.randomUUID();
        this.gameId = gameId;
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

    public UUID getGameId() {
        return gameId;
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
