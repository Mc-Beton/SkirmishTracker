package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.Warband;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WarbandRepository extends JpaRepository<Warband, UUID> {

    Optional<Warband> findByTournamentIdAndUserId(UUID tournamentId, UUID userId);

    List<Warband> findByTournamentId(UUID tournamentId);

    List<Warband> findByUserId(UUID userId);

    List<Warband> findByTournamentIdIn(java.util.Collection<UUID> tournamentIds);
}
