package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.Tournament;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface TournamentRepository extends JpaRepository<Tournament, UUID>, JpaSpecificationExecutor<Tournament> {

    /** Row lock serialises concurrent registrations so the player limit can never be exceeded. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Tournament t where t.id = :id")
    Optional<Tournament> findByIdForUpdate(UUID id);

    List<Tournament> findByOwnerIdOrderByStartsAtDesc(UUID ownerId);
}
