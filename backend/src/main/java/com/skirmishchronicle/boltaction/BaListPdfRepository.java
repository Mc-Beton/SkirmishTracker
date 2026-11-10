package com.skirmishchronicle.boltaction;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BaListPdfRepository extends JpaRepository<BaListPdf, UUID> {
}
