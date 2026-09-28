package com.skirmishchronicle.league;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LeagueTournamentRepository extends JpaRepository<LeagueTournament, UUID> {

    List<LeagueTournament> findByLeagueId(UUID leagueId);

    List<LeagueTournament> findByTournamentId(UUID tournamentId);

    Optional<LeagueTournament> findByLeagueIdAndTournamentId(UUID leagueId, UUID tournamentId);
}
