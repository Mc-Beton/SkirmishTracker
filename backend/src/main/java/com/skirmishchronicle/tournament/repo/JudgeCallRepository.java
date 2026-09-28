package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.JudgeCall;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JudgeCallRepository extends JpaRepository<JudgeCall, UUID> {

    List<JudgeCall> findTop50ByTournamentIdOrderByCreatedAtDesc(UUID tournamentId);

    List<JudgeCall> findByTournamentIdAndResolvedAtIsNull(UUID tournamentId);

    boolean existsByMatchIdAndResolvedAtIsNull(UUID matchId);
}
