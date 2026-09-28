package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * One game of a round. {@code playerB == null} means BYE. Only small points are stored;
 * big points are derived from the tournament's scoring settings, so changing them re-scores everything.
 */
@Entity
@Table(name = "tournament_matches")
public class TournamentMatch extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "table_number", nullable = false)
    private int tableNumber;

    @Column(name = "player_a", nullable = false)
    private UUID playerA;

    @Column(name = "player_b")
    private UUID playerB;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_type", length = 20)
    private MatchResultType resultType;

    @Column(name = "small_a")
    private Integer smallA;

    @Column(name = "small_b")
    private Integer smallB;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MatchStatus status = MatchStatus.PENDING;

    @Column(name = "reported_by")
    private UUID reportedBy;

    @Column(name = "reported_at")
    private Instant reportedAt;

    @Column(name = "confirmed_by")
    private UUID confirmedBy;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "team_match_id")
    private UUID teamMatchId;

    @Column(name = "seed_a")
    private Integer seedA;

    @Column(name = "seed_b")
    private Integer seedB;

    @Version
    private Long version;

    protected TournamentMatch() {
    }

    public TournamentMatch(UUID roundId, UUID tournamentId, int tableNumber, UUID playerA, UUID playerB) {
        this.id = UUID.randomUUID();
        this.roundId = roundId;
        this.tournamentId = tournamentId;
        this.tableNumber = tableNumber;
        this.playerA = playerA;
        this.playerB = playerB;
        if (playerB == null) {
            this.resultType = MatchResultType.BYE;
            this.status = MatchStatus.CONFIRMED;
        }
    }

    public UUID getTeamMatchId() {
        return teamMatchId;
    }

    public void setTeamMatchId(UUID teamMatchId) {
        this.teamMatchId = teamMatchId;
    }

    /** Bracket seeds (knockout rounds only). */
    public void setSeeds(Integer seedA, Integer seedB) {
        this.seedA = seedA;
        this.seedB = seedB;
    }

    public Integer getSeedA() {
        return seedA;
    }

    public Integer getSeedB() {
        return seedB;
    }

    public boolean isBye() {
        return playerB == null;
    }

    public boolean involves(UUID userId) {
        return userId.equals(playerA) || userId.equals(playerB);
    }

    /** Small points from the point of view of the given player. */
    public Integer smallFor(UUID userId) {
        return userId.equals(playerA) ? smallA : smallB;
    }

    public Integer smallAgainst(UUID userId) {
        return userId.equals(playerA) ? smallB : smallA;
    }

    public UUID opponentOf(UUID userId) {
        return userId.equals(playerA) ? playerB : playerA;
    }

    public void report(UUID reporter, int a, int b) {
        this.resultType = MatchResultType.PLAYED;
        this.smallA = a;
        this.smallB = b;
        this.status = MatchStatus.REPORTED;
        this.reportedBy = reporter;
        this.reportedAt = Instant.now();
        this.confirmedBy = null;
        this.confirmedAt = null;
    }

    public void confirm(UUID confirmer) {
        this.status = MatchStatus.CONFIRMED;
        this.confirmedBy = confirmer;
        this.confirmedAt = Instant.now();
    }

    public void dispute() {
        this.status = MatchStatus.DISPUTED;
    }

    /** Organizer decision: final immediately. */
    public void setResult(UUID organizer, MatchResultType type, Integer a, Integer b) {
        this.resultType = type;
        this.smallA = a;
        this.smallB = b;
        confirm(organizer);
    }

    /** Organizer swaps players in a PAIRED round. */
    public void replacePlayer(UUID from, UUID to) {
        if (from.equals(playerA)) {
            playerA = to;
        } else if (from.equals(playerB)) {
            playerB = to;
        }
    }

    public void normalizeAfterSwap() {
        if (playerA == null && playerB != null) {
            playerA = playerB;
            playerB = null;
        }
        if (playerB == null) {
            resultType = MatchResultType.BYE;
            status = MatchStatus.CONFIRMED;
        } else {
            resultType = null;
            status = MatchStatus.PENDING;
        }
        smallA = null;
        smallB = null;
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

    public int getTableNumber() {
        return tableNumber;
    }

    public UUID getPlayerA() {
        return playerA;
    }

    public UUID getPlayerB() {
        return playerB;
    }

    public MatchResultType getResultType() {
        return resultType;
    }

    public Integer getSmallA() {
        return smallA;
    }

    public Integer getSmallB() {
        return smallB;
    }

    public MatchStatus getStatus() {
        return status;
    }

    public UUID getReportedBy() {
        return reportedBy;
    }
}
