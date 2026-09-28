package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.TournamentRoundPlan;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoundPlanRepository extends JpaRepository<TournamentRoundPlan, UUID> {

    List<TournamentRoundPlan> findByTournamentIdOrderByNumberAsc(UUID tournamentId);

    Optional<TournamentRoundPlan> findByTournamentIdAndNumber(UUID tournamentId, int number);
}
