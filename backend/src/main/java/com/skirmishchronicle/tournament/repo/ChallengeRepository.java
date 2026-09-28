package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.ChallengeStatus;
import com.skirmishchronicle.tournament.domain.TournamentChallenge;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChallengeRepository extends JpaRepository<TournamentChallenge, UUID> {

    List<TournamentChallenge> findByTournamentIdAndStatusIn(UUID tournamentId, Collection<ChallengeStatus> statuses);

    List<TournamentChallenge> findByTournamentIdOrderByCreatedAtDesc(UUID tournamentId);
}
