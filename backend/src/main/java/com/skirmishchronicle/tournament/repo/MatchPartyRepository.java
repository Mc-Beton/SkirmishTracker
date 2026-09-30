package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.MatchParty;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MatchPartyRepository extends JpaRepository<MatchParty, UUID> {

    List<MatchParty> findByMatchId(UUID matchId);

    Optional<MatchParty> findByMatchIdAndUserId(UUID matchId, UUID userId);

    List<MatchParty> findByMatchIdIn(Collection<UUID> matchIds);
}
