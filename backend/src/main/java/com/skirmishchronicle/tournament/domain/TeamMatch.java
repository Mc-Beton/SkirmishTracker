package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Team A vs team B in one round ({@code teamB == null}: BYE). Its individual games are tournament matches with
 * {@code team_match_id} set, on tables (group - 1) × size + 1 … group × size.
 */
@Entity
@Table(name = "team_matches")
public class TeamMatch extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "group_number", nullable = false)
    private int groupNumber;

    @Column(name = "team_a", nullable = false)
    private UUID teamA;

    @Column(name = "team_b")
    private UUID teamB;

    @Column(name = "seed_a")
    private Integer seedA;

    @Column(name = "seed_b")
    private Integer seedB;

    @Column(name = "lineup_a", length = 400)
    private String lineupA;

    @Column(name = "lineup_b", length = 400)
    private String lineupB;

    protected TeamMatch() {
    }

    public TeamMatch(UUID roundId, UUID tournamentId, int groupNumber, UUID teamA, UUID teamB,
                     Integer seedA, Integer seedB) {
        this.id = UUID.randomUUID();
        this.roundId = roundId;
        this.tournamentId = tournamentId;
        this.groupNumber = groupNumber;
        this.teamA = teamA;
        this.teamB = teamB;
        this.seedA = seedA;
        this.seedB = seedB;
    }

    public boolean isBye() {
        return teamB == null;
    }

    public boolean involves(UUID team) {
        return team.equals(teamA) || team.equals(teamB);
    }

    public void setLineup(UUID team, List<UUID> order) {
        String value = order.stream().map(UUID::toString).collect(Collectors.joining(","));
        if (team.equals(teamA)) {
            lineupA = value;
        } else if (team.equals(teamB)) {
            lineupB = value;
        }
    }

    public List<UUID> lineup(UUID team) {
        String value = team.equals(teamA) ? lineupA : team.equals(teamB) ? lineupB : null;
        return value == null || value.isBlank() ? List.of()
                : Arrays.stream(value.split(",")).map(UUID::fromString).toList();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getRoundId() {
        return roundId;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public int getGroupNumber() {
        return groupNumber;
    }

    public UUID getTeamA() {
        return teamA;
    }

    public UUID getTeamB() {
        return teamB;
    }

    public Integer getSeedA() {
        return seedA;
    }

    public Integer getSeedB() {
        return seedB;
    }
}
