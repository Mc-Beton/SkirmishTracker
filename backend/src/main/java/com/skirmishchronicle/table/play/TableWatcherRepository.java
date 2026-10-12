package com.skirmishchronicle.table.play;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TableWatcherRepository extends JpaRepository<TableWatcher, TableWatcher.Key> {

    @Query("select count(w) from TableWatcher w where w.id.tableId = :tableId")
    long countByTable(UUID tableId);

    @Query("select w.id.tableId from TableWatcher w where w.id.userId = :userId")
    List<UUID> tableIdsOf(UUID userId);

    @Modifying
    @Query("delete from TableWatcher w where w.id.tableId = :tableId")
    void deleteByTable(UUID tableId);
}
