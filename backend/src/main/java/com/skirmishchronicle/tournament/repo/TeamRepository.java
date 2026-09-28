package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.Team;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamRepository extends JpaRepository<Team, UUID> {

    List<Team> findByTournamentIdOrderByCreatedAtAsc(UUID tournamentId);

    long countByTournamentId(UUID tournamentId);

    boolean existsByTournamentIdAndNameIgnoreCase(UUID tournamentId, String name);
}
