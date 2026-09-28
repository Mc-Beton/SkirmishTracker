package com.skirmishchronicle.identity.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Link between a user and an external login provider (google, discord). */
@Entity
@Table(name = "user_identities")
public class UserIdentity extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 20)
    private String provider;

    @Column(nullable = false)
    private String subject;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected UserIdentity() {
    }

    public UserIdentity(UUID userId, String provider, String subject) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.provider = provider;
        this.subject = subject;
        this.createdAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public String getProvider() {
        return provider;
    }

    @Override
    public UUID getId() {
        return id;
    }
}
