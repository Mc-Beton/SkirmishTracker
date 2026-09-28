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

@Entity
@Table(name = "team_members")
public class TeamMember extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "team_id", nullable = false)
    private UUID teamId;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Default line-up position (1 = first board). */
    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TeamMemberStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TeamMember() {
    }

    public TeamMember(UUID teamId, UUID tournamentId, UUID userId, int position, TeamMemberStatus status) {
        this.id = UUID.randomUUID();
        this.teamId = teamId;
        this.tournamentId = tournamentId;
        this.userId = userId;
        this.position = position;
        this.status = status;
        this.createdAt = Instant.now();
    }

    public void accept() {
        this.status = TeamMemberStatus.ACCEPTED;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTeamId() {
        return teamId;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getPosition() {
        return position;
    }

    public TeamMemberStatus getStatus() {
        return status;
    }

    public boolean isAccepted() {
        return status == TeamMemberStatus.ACCEPTED;
    }
}
