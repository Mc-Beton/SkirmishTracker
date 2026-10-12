package com.skirmishchronicle.table.library;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** A decorative map picture and the natural areas drawn on it (JSON list of TerrainShapes.Area). */
@Entity
@Table(name = "table_backgrounds")
public class TableBackground extends AbstractEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "image_id", nullable = false)
    private UUID imageId;

    @Column(name = "width_in", nullable = false)
    private double widthIn;

    @Column(name = "height_in", nullable = false)
    private double heightIn;

    @Column(nullable = false, columnDefinition = "text")
    private String areas;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected TableBackground() {
    }

    public TableBackground(UUID createdBy) {
        this.id = UUID.randomUUID();
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void update(String name, UUID imageId, double widthIn, double heightIn, String areas) {
        this.name = name;
        this.imageId = imageId;
        this.widthIn = widthIn;
        this.heightIn = heightIn;
        this.areas = areas;
        this.updatedAt = Instant.now();
    }

    public void setActive(boolean active) {
        this.active = active;
        this.updatedAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public UUID getImageId() {
        return imageId;
    }

    public double getWidthIn() {
        return widthIn;
    }

    public double getHeightIn() {
        return heightIn;
    }

    public String getAreas() {
        return areas;
    }

    public boolean isActive() {
        return active;
    }
}
