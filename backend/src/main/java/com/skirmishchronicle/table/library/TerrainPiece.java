package com.skirmishchronicle.table.library;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** A terrain piece of the library: picture, real size and shapes (JSON list of TerrainShapes.Shape). */
@Entity
@Table(name = "table_terrain_pieces")
public class TerrainPiece extends AbstractEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 30)
    private String category;

    @Column(name = "image_id", nullable = false)
    private UUID imageId;

    @Column(name = "width_in", nullable = false)
    private double widthIn;

    @Column(name = "height_in", nullable = false)
    private double heightIn;

    @Column(nullable = false, columnDefinition = "text")
    private String shapes;

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

    protected TerrainPiece() {
    }

    public TerrainPiece(UUID createdBy) {
        this.id = UUID.randomUUID();
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void update(String name, String category, UUID imageId, double widthIn, double heightIn, String shapes) {
        this.name = name;
        this.category = category;
        this.imageId = imageId;
        this.widthIn = widthIn;
        this.heightIn = heightIn;
        this.shapes = shapes;
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

    public String getCategory() {
        return category;
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

    public String getShapes() {
        return shapes;
    }

    public boolean isActive() {
        return active;
    }
}
