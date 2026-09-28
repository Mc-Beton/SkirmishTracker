package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MatchRepository extends JpaRepository<TournamentMatch, UUID> {

    List<TournamentMatch> findByTournamentId(UUID tournamentId);

    List<TournamentMatch> findByRoundIdOrderByTableNumberAsc(UUID roundId);

    /** Rows [matchId, playerA, playerB, smallA, smallB, roundStartedAt, tournamentId] of played, confirmed games. */
    @Query("select m.id, m.playerA, m.playerB, m.smallA, m.smallB, r.startedAt, m.tournamentId "
            + "from TournamentMatch m, TournamentRound r where r.id = m.roundId and m.status = :status "
            + "and m.resultType = :type and m.playerB is not null")
    List<Object[]> playedGames(MatchStatus status, MatchResultType type);

    /** [count, latest confirmation] – changes whenever a result is confirmed or corrected. */
    @Query("select count(m), max(m.confirmedAt) from TournamentMatch m where m.status = :status")
    List<Object[]> fingerprint(MatchStatus status);

    @Query("select distinct m.tournamentId from TournamentMatch m where m.playerA = :userId or m.playerB = :userId")
    List<UUID> tournamentIdsOf(UUID userId);

    List<TournamentMatch> findByTournamentIdIn(Collection<UUID> tournamentIds);
}
