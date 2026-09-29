package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.MatchSchemeDraw;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchemeDrawRepository extends JpaRepository<MatchSchemeDraw, UUID> {

    List<MatchSchemeDraw> findByMatchId(UUID matchId);

    List<MatchSchemeDraw> findByMatchIdIn(java.util.Collection<UUID> matchIds);

    Optional<MatchSchemeDraw> findByMatchIdAndUserId(UUID matchId, UUID userId);
}
