package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Plan of one round, set in advance: used when the round is generated. */
@Entity
@Table(name = "tournament_round_plans")
public class TournamentRoundPlan extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(nullable = false)
    private int number;

    @Column(name = "scenario_code", length = 60)
    private String scenarioCode;

    /** Null = default (round 1: first-round mode of the tournament, later rounds: Swiss). */
    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private RoundPairing pairing;

    @Enumerated(EnumType.STRING)
    @Column(name = "table_order", nullable = false, length = 20)
    private TableOrder tableOrder = TableOrder.BY_STANDINGS;

    /** Null = default (round 1: the tournament's "also in round 1" flag, later rounds: on). */
    @Column(name = "soft_preferences")
    private Boolean softPreferences;

    /** Planned length of the round in minutes (null = no timer). */
    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    protected TournamentRoundPlan() {
    }

    public TournamentRoundPlan(UUID tournamentId, int number, String scenarioCode, RoundPairing pairing,
                               TableOrder tableOrder, Boolean softPreferences, Integer durationMinutes) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.number = number;
        this.scenarioCode = scenarioCode;
        this.pairing = pairing;
        this.tableOrder = tableOrder == null ? TableOrder.BY_STANDINGS : tableOrder;
        this.softPreferences = softPreferences;
        this.durationMinutes = durationMinutes;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public int getNumber() {
        return number;
    }

    public String getScenarioCode() {
        return scenarioCode;
    }

    public RoundPairing getPairing() {
        return pairing;
    }

    public TableOrder getTableOrder() {
        return tableOrder;
    }

    public Boolean getSoftPreferences() {
        return softPreferences;
    }
}
