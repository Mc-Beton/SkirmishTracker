package com.skirmishchronicle.table.library;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** A saved map: background + placed terrain pieces (JSON list of TerrainShapes.Placement). */
@Entity
@Table(name = "table_maps")
public class TableMap extends AbstractEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "background_id", nullable = false)
    private UUID backgroundId;

    @Column(nullable = false, columnDefinition = "text")
    private String placements;

    @Column(name = "deployment_depth", nullable = false)
    private double deploymentDepth = 8;

    @Column(name = "is_public", nullable = false)
    private boolean isPublic;

    @Column(nullable = false)
    private boolean official;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected TableMap() {
    }

    public TableMap(UUID ownerId) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void update(String name, UUID backgroundId, String placements, double deploymentDepth, boolean isPublic,
                       boolean official) {
        this.name = name;
        this.backgroundId = backgroundId;
        this.placements = placements;
        this.deploymentDepth = deploymentDepth;
        this.isPublic = isPublic;
        this.official = official;
        this.updatedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public UUID getBackgroundId() {
        return backgroundId;
    }

    public String getPlacements() {
        return placements;
    }

    public double getDeploymentDepth() {
        return deploymentDepth;
    }

    public boolean isPublic() {
        return isPublic;
    }

    public boolean isOfficial() {
        return official;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
