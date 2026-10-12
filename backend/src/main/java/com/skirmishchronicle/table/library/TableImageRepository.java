package com.skirmishchronicle.table.library;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TableImageRepository extends JpaRepository<TableImage, UUID> {

    Optional<TableImage> findFirstBySha256(String sha256);
}
