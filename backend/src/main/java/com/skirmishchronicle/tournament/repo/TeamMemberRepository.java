package com.skirmishchronicle.tournament.repo;

import com.skirmishchronicle.tournament.domain.TeamMember;
import com.skirmishchronicle.tournament.domain.TeamMemberStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamMemberRepository extends JpaRepository<TeamMember, UUID> {

    List<TeamMember> findByTeamIdOrderByPositionAsc(UUID teamId);

    List<TeamMember> findByTournamentId(UUID tournamentId);

    Optional<TeamMember> findByTeamIdAndUserId(UUID teamId, UUID userId);

    Optional<TeamMember> findByTournamentIdAndUserIdAndStatus(UUID tournamentId, UUID userId, TeamMemberStatus status);

    List<TeamMember> findByTournamentIdAndUserId(UUID tournamentId, UUID userId);

    long countByTeamIdAndStatus(UUID teamId, TeamMemberStatus status);
}
