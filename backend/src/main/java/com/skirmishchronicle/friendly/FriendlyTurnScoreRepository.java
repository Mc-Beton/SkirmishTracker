package com.skirmishchronicle.friendly;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendlyTurnScoreRepository extends JpaRepository<FriendlyTurnScore, UUID> {

    List<FriendlyTurnScore> findByGameId(UUID gameId);

    List<FriendlyTurnScore> findByGameIdIn(Collection<UUID> gameIds);

    Optional<FriendlyTurnScore> findByGameIdAndUserIdAndTurn(UUID gameId, UUID userId, int turn);
}
