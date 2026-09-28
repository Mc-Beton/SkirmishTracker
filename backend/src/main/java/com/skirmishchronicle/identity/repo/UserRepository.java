package com.skirmishchronicle.identity.repo;

import com.skirmishchronicle.identity.domain.User;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByDisplayNameIgnoreCase(String displayName);

    Optional<User> findByDisplayNameIgnoreCase(String displayName);

    java.util.List<User> findTop10ByDisplayNameContainingIgnoreCaseOrderByDisplayNameAsc(String fragment);
}
