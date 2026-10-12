package com.skirmishchronicle.table.library;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TableMapRepository extends JpaRepository<TableMap, UUID> {

    long countByOwnerId(UUID ownerId);

    /**
     * Search by map name or the author's display name. {@code scope}: OFFICIAL, PUBLIC (shared by players) or
     * MINE (the caller's own maps, private ones included).
     */
    @Query("""
            select m from TableMap m, com.skirmishchronicle.identity.domain.User u
            where u.id = m.ownerId
              and (:q = '' or lower(m.name) like concat('%', :q, '%') or lower(u.displayName) like concat('%', :q, '%'))
              and ((:scope = 'OFFICIAL' and m.official = true)
                or (:scope = 'PUBLIC' and m.official = false and m.isPublic = true)
                or (:scope = 'MINE' and m.ownerId = :me))
            order by m.updatedAt desc""")
    List<TableMap> search(@Param("scope") String scope, @Param("q") String q, @Param("me") java.util.UUID me,
                          Pageable page);
}
