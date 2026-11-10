package com.skirmishchronicle.boltaction;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** The PDF of a Bolt Action list (one per list; replaced on a new upload). */
@Entity
@Table(name = "ba_list_pdfs")
public class BaListPdf extends AbstractEntity {

    @Id
    @Column(name = "list_id")
    private UUID listId;

    @Column(nullable = false)
    private byte[] bytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected BaListPdf() {
    }

    public BaListPdf(UUID listId, byte[] bytes, String sha256) {
        this.listId = listId;
        this.bytes = bytes;
        this.sha256 = sha256;
        this.createdAt = Instant.now();
    }

    public void replace(byte[] bytes, String sha256) {
        this.bytes = bytes;
        this.sha256 = sha256;
        this.createdAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return listId;
    }

    public byte[] getBytes() {
        return bytes;
    }

    public String getSha256() {
        return sha256;
    }
}
