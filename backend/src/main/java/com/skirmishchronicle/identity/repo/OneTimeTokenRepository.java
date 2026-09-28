package com.skirmishchronicle.identity.repo;

import com.skirmishchronicle.identity.domain.OneTimeToken;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface OneTimeTokenRepository extends JpaRepository<OneTimeToken, UUID> {

    Optional<OneTimeToken> findByTokenHashAndType(String tokenHash, OneTimeToken.Type type);

    @Modifying
    @Query("update OneTimeToken t set t.usedAt = :now where t.userId = :userId and t.type = :type and t.usedAt is null")
    int invalidateAll(UUID userId, OneTimeToken.Type type, Instant now);

    @Modifying
    @Query("delete from OneTimeToken t where t.expiresAt < :cutoff")
    int deleteExpiredBefore(Instant cutoff);
}
