package com.skirmishchronicle.table.play;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/** An observer of a table (joined with the watch link). Read-only access. */
@Entity
@Table(name = "table_watchers")
public class TableWatcher {

    @Embeddable
    public static class Key implements Serializable {

        @Column(name = "table_id")
        private UUID tableId;

        @Column(name = "user_id")
        private UUID userId;

        protected Key() {
        }

        public Key(UUID tableId, UUID userId) {
            this.tableId = tableId;
            this.userId = userId;
        }

        public UUID getTableId() {
            return tableId;
        }

        public UUID getUserId() {
            return userId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && java.util.Objects.equals(tableId, k.tableId) && java.util.Objects.equals(userId, k.userId);
        }

        @Override
        public int hashCode() {
            return java.util.Objects.hash(tableId, userId);
        }
    }

    @EmbeddedId
    private Key id;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected TableWatcher() {
    }

    public TableWatcher(UUID tableId, UUID userId) {
        this.id = new Key(tableId, userId);
        this.joinedAt = Instant.now();
    }

    public Key getId() {
        return id;
    }
}
