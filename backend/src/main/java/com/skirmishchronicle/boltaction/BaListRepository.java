package com.skirmishchronicle.boltaction;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BaListRepository extends JpaRepository<BaList, UUID> {

    Optional<BaList> findByTournamentIdAndUserId(UUID tournamentId, UUID userId);

    List<BaList> findByTournamentId(UUID tournamentId);

    List<BaList> findByUserId(UUID userId);

    List<BaList> findByTournamentIdIn(Collection<UUID> tournamentIds);
}
