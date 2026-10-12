package com.skirmishchronicle.armylist;

import com.skirmishchronicle.common.AbstractEntity;
import com.skirmishchronicle.tournament.domain.ListFormat;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * A list saved in "My lists". It is a template: choosing it for a tournament or an own game copies it, so later
 * edits never change games already played. Units use the tournament list JSON shape (WarbandService.StoredUnit).
 */
@Entity
@Table(name = "army_lists")
public class ArmyList extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Per-player running number (#1, #2, …), shown next to the name. */
    @Column(nullable = false)
    private int number;

    @Column(length = 80)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "list_format", nullable = false, length = 20)
    private ListFormat format;

    @Column(nullable = false, length = 60)
    private String faction;

    @Column(name = "allied_faction", length = 60)
    private String alliedFaction;

    /** Leader INT (classic lists); 0 for rosters, whose leader is picked for every game. */
    @Column(name = "leader_int", nullable = false)
    private int leaderInt;

    /** Points when last saved; the current total is recomputed from the army lists (errata). */
    @Column(name = "total_points", nullable = false)
    private int totalPoints;

    @Column(nullable = false, columnDefinition = "text")
    private String units;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected ArmyList() {
    }

    public ArmyList(UUID userId, int number) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.number = number;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void update(String name, ListFormat format, String faction, String alliedFaction, int leaderInt,
                       int totalPoints, String unitsJson) {
        this.name = name;
        this.format = format;
        this.faction = faction;
        this.alliedFaction = alliedFaction;
        this.leaderInt = leaderInt;
        this.totalPoints = totalPoints;
        this.units = unitsJson;
        this.updatedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getNumber() {
        return number;
    }

    public String getName() {
        return name;
    }

    public ListFormat getFormat() {
        return format;
    }

    public String getFaction() {
        return faction;
    }

    public String getAlliedFaction() {
        return alliedFaction;
    }

    public int getLeaderInt() {
        return leaderInt;
    }

    public int getTotalPoints() {
        return totalPoints;
    }

    public String getUnits() {
        return units;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
