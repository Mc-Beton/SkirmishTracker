package com.skirmishchronicle.support;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A message from the contact form. */
@Entity
@Table(name = "support_messages")
public class SupportMessage extends AbstractEntity {

    public enum Topic { QUESTION, BUG, IDEA, OTHER }

    @Id
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(length = 80)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Topic topic;

    @Column(nullable = false, length = 5000)
    private String message;

    @Column(nullable = false, length = 5)
    private String locale;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SupportMessage() {
    }

    public SupportMessage(UUID userId, String email, String name, Topic topic, String message, String locale) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.email = email;
        this.name = name;
        this.topic = topic;
        this.message = message;
        this.locale = locale;
        this.createdAt = Instant.now();
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }

    public String getName() {
        return name;
    }

    public Topic getTopic() {
        return topic;
    }

    public String getMessage() {
        return message;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
