package com.skirmishchronicle.armylist;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ArmyListRepository extends JpaRepository<ArmyList, UUID> {

    List<ArmyList> findByUserIdOrderByNumberAsc(UUID userId);

    long countByUserId(UUID userId);

    @Query("select coalesce(max(l.number), 0) from ArmyList l where l.userId = :userId")
    int maxNumber(UUID userId);
}
