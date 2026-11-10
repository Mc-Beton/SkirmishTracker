package com.skirmishchronicle.boltaction;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * A player's Bolt Action list for one tournament: nation, declared points / order dice / platoons and the list
 * itself as pasted text and/or an attached PDF (bytes in {@link BaListPdf}).
 */
@Entity
@Table(name = "ba_lists")
public class BaList extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 40)
    private String nation;

    @Column(nullable = false)
    private int points;

    @Column(name = "order_dice", nullable = false)
    private int orderDice;

    @Column(nullable = false)
    private int platoons;

    @Column(name = "list_text", columnDefinition = "text")
    private String text;

    @Column(name = "pdf_name", length = 120)
    private String pdfName;

    @Column(name = "pdf_size")
    private Integer pdfSize;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected BaList() {
    }

    public BaList(UUID tournamentId, UUID userId) {
        this.id = UUID.randomUUID();
        this.tournamentId = tournamentId;
        this.userId = userId;
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

    public void update(String nation, int points, int orderDice, int platoons, String text) {
        this.nation = nation;
        this.points = points;
        this.orderDice = orderDice;
        this.platoons = platoons;
        this.text = text;
        this.updatedAt = Instant.now();
    }

    public void attachPdf(String name, int size) {
        this.pdfName = name;
        this.pdfSize = size;
        this.updatedAt = Instant.now();
    }

    public void detachPdf() {
        this.pdfName = null;
        this.pdfSize = null;
        this.updatedAt = Instant.now();
    }

    public boolean hasPdf() {
        return pdfName != null;
    }

    /** A list counts as submitted once it has the list itself: pasted text or a PDF. */
    public boolean isComplete() {
        return hasPdf() || (text != null && !text.isBlank());
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

    public String getNation() {
        return nation;
    }

    public int getPoints() {
        return points;
    }

    public int getOrderDice() {
        return orderDice;
    }

    public int getPlatoons() {
        return platoons;
    }

    public String getText() {
        return text;
    }

    public String getPdfName() {
        return pdfName;
    }

    public Integer getPdfSize() {
        return pdfSize;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
