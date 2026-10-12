package com.skirmishchronicle.table.library;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** An uploaded picture (map background or terrain piece). Immutable once stored. */
@Entity
@Table(name = "table_images")
public class TableImage extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "content_type", nullable = false, length = 20)
    private String contentType;

    @Column(nullable = false)
    private byte[] bytes;

    @Column(name = "width_px", nullable = false)
    private int widthPx;

    @Column(name = "height_px", nullable = false)
    private int heightPx;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TableImage() {
    }

    public TableImage(UUID ownerId, String contentType, byte[] bytes, int widthPx, int heightPx, String sha256) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.contentType = contentType;
        this.bytes = bytes;
        this.widthPx = widthPx;
        this.heightPx = heightPx;
        this.sha256 = sha256;
        this.createdAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public String getContentType() {
        return contentType;
    }

    public byte[] getBytes() {
        return bytes;
    }

    public int getWidthPx() {
        return widthPx;
    }

    public int getHeightPx() {
        return heightPx;
    }

    public String getSha256() {
        return sha256;
    }
}
