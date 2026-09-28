package com.skirmishchronicle.support;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface SupportRepository extends JpaRepository<SupportMessage, UUID> {

    @Modifying
    @Query("delete from SupportMessage m where m.createdAt < :before")
    int deleteOlderThan(Instant before);
}
