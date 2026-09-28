package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.TeamMatch;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamMatchRepository extends JpaRepository<TeamMatch, UUID> {

    List<TeamMatch> findByTournamentId(UUID tournamentId);

    List<TeamMatch> findByRoundIdOrderByGroupNumberAsc(UUID roundId);
}
