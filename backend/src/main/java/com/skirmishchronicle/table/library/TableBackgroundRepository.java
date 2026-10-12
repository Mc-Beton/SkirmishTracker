package com.skirmishchronicle.table.library;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TableBackgroundRepository extends JpaRepository<TableBackground, UUID> {

    List<TableBackground> findByActiveTrueOrderByNameAsc();
}
