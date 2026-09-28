package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.MatchTurnScore;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TurnScoreRepository extends JpaRepository<MatchTurnScore, UUID> {

    List<MatchTurnScore> findByMatchId(UUID matchId);

    Optional<MatchTurnScore> findByMatchIdAndUserIdAndTurn(UUID matchId, UUID userId, int turn);
}
