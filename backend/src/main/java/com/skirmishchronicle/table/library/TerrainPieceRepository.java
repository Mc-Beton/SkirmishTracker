package com.skirmishchronicle.table.library;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TerrainPieceRepository extends JpaRepository<TerrainPiece, UUID> {

    List<TerrainPiece> findByActiveTrueOrderByCategoryAscNameAsc();
}
