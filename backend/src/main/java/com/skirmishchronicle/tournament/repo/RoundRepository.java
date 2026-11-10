package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.TournamentRound;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoundRepository extends JpaRepository<TournamentRound, UUID> {

    List<TournamentRound> findByTournamentIdOrderByNumberAsc(UUID tournamentId);

    Optional<TournamentRound> findByTournamentIdAndNumber(UUID tournamentId, int number);

    Optional<TournamentRound> findFirstByTournamentIdOrderByNumberDesc(UUID tournamentId);

    long countByTournamentId(UUID tournamentId);

    /** True once a round left the organizer-only PAIRED state (its pairings are public). */
    boolean existsByTournamentIdAndStatusNot(UUID tournamentId, com.skirmishchronicle.tournament.domain.RoundStatus status);

    /** Rounds whose timer is running and has not announced the end yet. */
    List<TournamentRound> findByTimerRunningSinceIsNotNullAndTimerNotifiedFalse();
}
