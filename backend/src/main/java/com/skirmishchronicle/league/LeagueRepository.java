package com.skirmishchronicle.league;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;

public interface LeagueRepository extends JpaRepository<League, UUID> {

    List<League> findAllByOrderByStartsOnDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from League l where l.id = :id")
    java.util.Optional<League> findByIdForUpdate(UUID id);
}
