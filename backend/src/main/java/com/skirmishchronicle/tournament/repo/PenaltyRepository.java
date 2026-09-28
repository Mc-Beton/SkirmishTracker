package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.TournamentPenalty;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PenaltyRepository extends JpaRepository<TournamentPenalty, UUID> {

    List<TournamentPenalty> findByTournamentIdOrderByCreatedAtAsc(UUID tournamentId);
}
