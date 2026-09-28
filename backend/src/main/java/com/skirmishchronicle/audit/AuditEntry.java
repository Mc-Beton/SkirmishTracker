package com.skirmishchronicle.audit;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditEntry extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Column(name = "entity_type", nullable = false, length = 40)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private UUID entityId;

    @Column(nullable = false, length = 60)
    private String action;

    @Column(length = 2000)
    private String details;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditEntry() {
    }

    public AuditEntry(UUID actorId, String entityType, UUID entityId, String action, String details) {
        this.id = UUID.randomUUID();
        this.actorId = actorId;
        this.entityType = entityType;
        this.entityId = entityId;
        this.action = action;
        this.details = details == null || details.length() <= 2000 ? details : details.substring(0, 2000);
        this.createdAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getActorId() {
        return actorId;
    }

    public String getAction() {
        return action;
    }

    public String getDetails() {
        return details;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
