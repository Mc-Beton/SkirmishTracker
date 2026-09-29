package com.skirmishchronicle.push;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One browser / device subscribed to Web Push for a user. The endpoint URL is a secret: never logged. */
@Entity
@Table(name = "push_subscriptions")
public class PushSubscription extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 1000, unique = true)
    private String endpoint;

    @Column(nullable = false, length = 200)
    private String p256dh;

    @Column(nullable = false, length = 100)
    private String auth;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_success_at")
    private Instant lastSuccessAt;

    protected PushSubscription() {
    }

    public PushSubscription(UUID userId, String endpoint, String p256dh, String auth, String userAgent) {
        this.id = UUID.randomUUID();
        this.createdAt = Instant.now();
        update(userId, p256dh, auth, userAgent);
        this.endpoint = endpoint;
    }

    public void update(UUID userId, String p256dh, String auth, String userAgent) {
        this.userId = userId;
        this.p256dh = p256dh;
        this.auth = auth;
        this.userAgent = userAgent;
    }

    public void delivered() {
        this.lastSuccessAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public String getP256dh() {
        return p256dh;
    }

    public String getAuth() {
        return auth;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
