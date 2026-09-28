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
@Table(name = "tournament_participants")
public class TournamentParticipant extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ParticipantStatus status;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(nullable = false)
    private boolean paid;

    @Enumerated(EnumType.STRING)
    @Column(name = "list_status", nullable = false, length = 20)
    private ListStatus listStatus = ListStatus.NOT_SUBMITTED;

    @Column(length = 80)
    private String club;

    @Column(length = 80)
    private String city;

    @Column(length = 60)
    private String faction;

    @Column(nullable = false)
    private boolean dropped;

    @Column
    private Integer seed;

    protected TournamentParticipant() {
    }

    public TournamentParticipant(UUID tournamentId, UUID userId, ParticipantStatus status) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.userId = userId;
        this.status = status;
        this.registeredAt = Instant.now();
    }

    /** Snapshot of the player's profile at registration. */
    public void snapshotProfile(String club, String city) {
        this.club = club;
        this.city = city;
    }

    /** Faction comes from the submitted warband (used by the "avoid same faction" preference). */
    public void setFaction(String faction) {
        this.faction = faction;
    }

    public Integer getSeed() {
        return seed;
    }

    public void setSeed(Integer seed) {
        this.seed = seed;
    }

    public void drop() {
        this.dropped = true;
    }

    public String getClub() {
        return club;
    }

    public String getCity() {
        return city;
    }

    public String getFaction() {
        return faction;
    }

    public boolean isDropped() {
        return dropped;
    }

    public void promote() {
        this.status = ParticipantStatus.REGISTERED;
    }

    public void setPaid(boolean paid) {
        this.paid = paid;
    }

    public void setListStatus(ListStatus listStatus) {
        this.listStatus = listStatus;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    public UUID getUserId() {
        return userId;
    }

    public ParticipantStatus getStatus() {
        return status;
    }

    public Instant getRegisteredAt() {
        return registeredAt;
    }

    public boolean isPaid() {
        return paid;
    }

    public ListStatus getListStatus() {
        return listStatus;
    }
}
