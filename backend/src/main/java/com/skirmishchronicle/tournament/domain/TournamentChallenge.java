package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A first-round challenge between two players, or a fixed pair set by the organizer. */
@Entity
@Table(name = "tournament_challenges")
public class TournamentChallenge extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "challenger_id", nullable = false)
    private UUID challengerId;

    @Column(name = "challenged_id", nullable = false)
    private UUID challengedId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ChallengeStatus status;

    @Column(name = "organizer_made", nullable = false)
    private boolean organizerMade;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

    protected TournamentChallenge() {
    }

    public TournamentChallenge(UUID tournamentId, UUID challengerId, UUID challengedId, boolean organizerMade) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.challengerId = challengerId;
        this.challengedId = challengedId;
        this.organizerMade = organizerMade;
        this.status = organizerMade ? ChallengeStatus.ACCEPTED : ChallengeStatus.PENDING;
        this.createdAt = Instant.now();
        if (organizerMade) {
            this.respondedAt = createdAt;
        }
    }

    public void resolve(ChallengeStatus next) {
        this.status = next;
        this.respondedAt = Instant.now();
    }

    public boolean involves(UUID userId) {
        return challengerId.equals(userId) || challengedId.equals(userId);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public UUID getChallengerId() {
        return challengerId;
    }

    public UUID getChallengedId() {
        return challengedId;
    }

    public ChallengeStatus getStatus() {
        return status;
    }

    public boolean isOrganizerMade() {
        return organizerMade;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
