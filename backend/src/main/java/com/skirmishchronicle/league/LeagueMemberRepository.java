package com.skirmishchronicle.league;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LeagueMemberRepository extends JpaRepository<LeagueMember, UUID> {

    List<LeagueMember> findByLeagueIdOrderByJoinedAtAsc(UUID leagueId);

    List<LeagueMember> findByUserId(UUID userId);

    Optional<LeagueMember> findByLeagueIdAndUserId(UUID leagueId, UUID userId);

    boolean existsByLeagueIdAndUserId(UUID leagueId, UUID userId);

    long countByLeagueId(UUID leagueId);
}
