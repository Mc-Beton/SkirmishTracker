package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A player at a table asks the judge (organizer) to come over. */
@Entity
@Table(name = "judge_calls")
public class JudgeCall extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "match_id", nullable = false)
    private UUID matchId;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(length = 300)
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    protected JudgeCall() {
    }

    public JudgeCall(UUID tournamentId, UUID matchId, UUID requestedBy, String note) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.matchId = matchId;
        this.requestedBy = requestedBy;
        this.note = note;
        this.createdAt = Instant.now();
    }

    public void resolve(UUID by) {
        if (resolvedAt == null) {
            resolvedAt = Instant.now();
            resolvedBy = by;
        }
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public UUID getMatchId() {
        return matchId;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public String getNote() {
        return note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }
}
