package com.skirmishchronicle.table.play;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface GameTableRepository extends JpaRepository<GameTable, UUID> {

    /** Commands on one table run one at a time (row lock), so sequence numbers and rules never race. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from GameTable t where t.id = :id")
    Optional<GameTable> findByIdForUpdate(UUID id);

    Optional<GameTable> findByInviteHash(String inviteHash);

    /** Tables the user plays or judges. */
    @Query("select t from GameTable t where t.playerA = :userId or t.playerB = :userId or t.judgeId = :userId order by t.updatedAt desc")
    List<GameTable> findMine(UUID userId);

    Optional<GameTable> findByJudgeInviteHash(String hash);

    /** Open invitations of a player (the seat is still free). */
    @Query("select t from GameTable t where t.invitedUserId = :userId and t.playerB is null order by t.updatedAt desc")
    List<GameTable> findInvitationsOf(UUID userId);

    Optional<GameTable> findByWatchInviteHash(String hash);

    @Query("select count(t) from GameTable t where (t.playerA = :userId or t.playerB = :userId) and t.status <> :done")
    long countNotInStatus(UUID userId, GameTable.Status done);

    /** Tables of the user that are not finished yet. */
    default long countOpen(UUID userId) {
        return countNotInStatus(userId, GameTable.Status.FINISHED);
    }
}
