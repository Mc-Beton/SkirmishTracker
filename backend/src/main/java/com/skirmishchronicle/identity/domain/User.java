package com.skirmishchronicle.identity.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User extends AbstractEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(name = "display_name", nullable = false, length = 40)
    private String displayName;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @Column(nullable = false, length = 5)
    private String locale = "pl";

    @Column(length = 80)
    private String club;

    @Column(name = "home_city", length = 80)
    private String homeCity;

    /** Wants to confirm results the opponent enters; otherwise those results are final at once. */
    @Column(name = "confirm_results", nullable = false)
    private boolean confirmResults;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private Set<Role> roles = EnumSet.of(Role.USER);

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected User() {
    }

    public User(String email, String displayName, String locale) {
        this.id = UUID.randomUUID();
        this.email = normalizeEmail(email);
        this.displayName = displayName.trim();
        this.locale = locale;
    }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
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

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public void markEmailVerified() {
        if (emailVerifiedAt == null) {
            emailVerifiedAt = Instant.now();
        }
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    public void registerFailedLogin(int maxAttempts, Instant lockUntil) {
        failedLoginAttempts++;
        if (failedLoginAttempts >= maxAttempts) {
            lockedUntil = lockUntil;
            failedLoginAttempts = 0;
        }
    }

    public void registerSuccessfulLogin() {
        failedLoginAttempts = 0;
        lockedUntil = null;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName.trim();
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean hasPassword() {
        return passwordHash != null;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(String locale) {
        this.locale = locale;
    }

    public String getClub() {
        return club;
    }

    public void setClub(String club) {
        this.club = club == null || club.isBlank() ? null : club.trim();
    }

    public String getHomeCity() {
        return homeCity;
    }

    public boolean isConfirmResults() {
        return confirmResults;
    }

    public void setConfirmResults(boolean confirmResults) {
        this.confirmResults = confirmResults;
    }

    public void setHomeCity(String homeCity) {
        this.homeCity = homeCity == null || homeCity.isBlank() ? null : homeCity.trim();
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
