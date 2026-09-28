package com.skirmishchronicle.identity.repo;

import com.skirmishchronicle.identity.domain.UserIdentity;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserIdentityRepository extends JpaRepository<UserIdentity, UUID> {

    Optional<UserIdentity> findByProviderAndSubject(String provider, String subject);
}
