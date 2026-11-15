package com.skirmishchronicle.friendly;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendlySchemeDrawRepository extends JpaRepository<FriendlySchemeDraw, UUID> {

    List<FriendlySchemeDraw> findByGameId(UUID gameId);

    Optional<FriendlySchemeDraw> findByGameIdAndUserId(UUID gameId, UUID userId);
}
