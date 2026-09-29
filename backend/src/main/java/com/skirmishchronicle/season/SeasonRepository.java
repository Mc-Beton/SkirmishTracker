package com.skirmishchronicle.season;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SeasonRepository extends JpaRepository<Season, UUID> {

    List<Season> findAllByOrderByStartsOnDesc();
}
