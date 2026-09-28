package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ParticipantRepository extends JpaRepository<TournamentParticipant, UUID> {

    Optional<TournamentParticipant> findByTournamentIdAndUserId(UUID tournamentId, UUID userId);

    long countByTournamentIdAndStatus(UUID tournamentId, ParticipantStatus status);

    List<TournamentParticipant> findByTournamentIdAndStatusOrderByRegisteredAtAsc(UUID tournamentId,
                                                                                  ParticipantStatus status);

    List<TournamentParticipant> findByTournamentIdOrderByStatusAscRegisteredAtAsc(UUID tournamentId);

    List<TournamentParticipant> findByUserId(UUID userId);

    /** Rows of [tournamentId, count] of registered (not waitlisted) players. */
    @Query("select p.tournamentId, count(p) from TournamentParticipant p "
            + "where p.tournamentId in :ids and p.status = :status group by p.tournamentId")
    List<Object[]> countByTournamentIds(Collection<UUID> ids, ParticipantStatus status);
}
