package com.skirmishchronicle.push;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {

    List<PushSubscription> findByUserIdOrderByCreatedAtAsc(UUID userId);

    Optional<PushSubscription> findByEndpoint(String endpoint);

    @Transactional
    long deleteByEndpoint(String endpoint);

    @Transactional
    long deleteByEndpointAndUserId(String endpoint, UUID userId);
}
