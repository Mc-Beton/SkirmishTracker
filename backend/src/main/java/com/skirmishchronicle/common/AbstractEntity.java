package com.skirmishchronicle.common;

import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Transient;
import java.util.UUID;
import org.springframework.data.domain.Persistable;

/**
 * Entities use application-assigned UUIDs. Implementing {@link Persistable} makes Spring Data call
 * {@code persist} (not {@code merge}) for new instances, avoiding a needless SELECT before INSERT.
 */
@MappedSuperclass
public abstract class AbstractEntity implements Persistable<UUID> {

    @Transient
    private boolean isNew = true;

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostPersist
    @PostLoad
    void markNotNew() {
        this.isNew = false;
    }
}
