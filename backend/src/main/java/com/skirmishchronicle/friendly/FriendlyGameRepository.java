package com.skirmishchronicle.friendly;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FriendlyGameRepository extends JpaRepository<FriendlyGame, UUID> {

    @Query("select g from FriendlyGame g where g.playerA = :userId or g.playerB = :userId order by g.playedOn desc, g.createdAt desc")
    List<FriendlyGame> findForPlayer(UUID userId);

    List<FriendlyGame> findByStatus(FriendlyGameStatus status);

    List<FriendlyGame> findByLeagueIdAndStatus(UUID leagueId, FriendlyGameStatus status);

    long countByReportedByAndStatus(UUID reportedBy, FriendlyGameStatus status);

    @Query("select count(g), max(g.decidedAt) from FriendlyGame g where g.status = :status")
    List<Object[]> fingerprint(FriendlyGameStatus status);
}
