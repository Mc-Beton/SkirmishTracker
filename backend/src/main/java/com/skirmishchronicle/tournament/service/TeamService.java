package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Team;
import com.skirmishchronicle.tournament.domain.TeamMember;
import com.skirmishchronicle.tournament.domain.TeamMemberStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.TeamMemberRepository;
import com.skirmishchronicle.tournament.repo.TeamRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Teams of a team tournament. A captain creates the team (and becomes its first member), invites players with an
 * account, the invited players accept. Accepted members are the tournament's participants. The organizer can add
 * or remove members, rename or drop teams.
 */
@Service
public class TeamService {

    private static final String AUDIT_TYPE = "TOURNAMENT";

    public record MemberView(UUID userId, String displayName, TeamMemberStatus status, int position) {
    }

    public record TeamView(UUID id, String name, UUID captainId, String captainName, List<MemberView> members,
                           boolean complete, boolean dropped, Integer seed, boolean canManage) {
    }

    public record Invitation(UUID teamId, String teamName, String captainName) {
    }

    public record TeamsView(Integer teamSize, List<TeamView> teams, List<Invitation> invitations, UUID myTeamId,
                            boolean canCreate) {
    }

    private final TeamRepository teams;
    private final TeamMemberRepository members;
    private final ParticipantRepository participants;
    private final UserRepository users;
    private final TournamentGuard guard;
    private final NotificationService notifications;
    private final AuditService audit;

    public TeamService(TeamRepository teams, TeamMemberRepository members, ParticipantRepository participants,
                       UserRepository users, TournamentGuard guard, NotificationService notifications,
                       AuditService audit) {
        this.teams = teams;
        this.members = members;
        this.participants = participants;
        this.users = users;
        this.guard = guard;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public TeamsView list(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        boolean manager = TournamentGuard.canManage(viewer, t);
        List<Team> all = teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId);
        List<TeamMember> ms = members.findByTournamentId(tournamentId);
        Set<UUID> ids = ms.stream().map(TeamMember::getUserId).collect(Collectors.toSet());
        all.forEach(x -> ids.add(x.getCaptainId()));
        Map<UUID, String> names = names(ids);
        UUID myTeam = viewer == null ? null : ms.stream()
                .filter(m -> m.isAccepted() && m.getUserId().equals(viewer.id())).map(TeamMember::getTeamId)
                .findFirst().orElse(null);
        List<TeamView> views = new ArrayList<>();
        for (Team team : all) {
            boolean mine = team.getId().equals(myTeam);
            boolean canManage = manager || (viewer != null && team.getCaptainId().equals(viewer.id()));
            List<MemberView> mv = ms.stream().filter(m -> m.getTeamId().equals(team.getId()))
                    // Pending invitations are private to the team and the organizer.
                    .filter(m -> m.isAccepted() || canManage || mine
                            || (viewer != null && m.getUserId().equals(viewer.id())))
                    .sorted(java.util.Comparator.comparingInt(TeamMember::getPosition))
                    .map(m -> new MemberView(m.getUserId(), names.getOrDefault(m.getUserId(), "?"), m.getStatus(),
                            m.getPosition()))
                    .toList();
            long accepted = ms.stream().filter(m -> m.getTeamId().equals(team.getId()) && m.isAccepted()).count();
            views.add(new TeamView(team.getId(), team.getName(), team.getCaptainId(),
                    names.getOrDefault(team.getCaptainId(), "?"), mv, t.getTeamSize() != null
                    && accepted == t.getTeamSize(), team.isDropped(), team.getSeed(), canManage));
        }
        List<Invitation> invitations = viewer == null ? List.of() : ms.stream()
                .filter(m -> !m.isAccepted() && m.getUserId().equals(viewer.id()))
                .map(m -> all.stream().filter(x -> x.getId().equals(m.getTeamId())).findFirst().orElse(null))
                .filter(java.util.Objects::nonNull)
                .map(x -> new Invitation(x.getId(), x.getName(), names.getOrDefault(x.getCaptainId(), "?")))
                .toList();
        boolean canCreate = viewer != null && myTeam == null && t.isTeamTournament()
                && t.getStatus() == TournamentStatus.PUBLISHED && hasFreeTeamSlot(t);
        return new TeamsView(t.getTeamSize(), views, invitations, myTeam, canCreate);
    }

    // ------------------------------------------------------------------ captain

    @Transactional
    public UUID create(CurrentUser actor, UUID tournamentId, String name) {
        Tournament t = guard.lock(tournamentId);
        requireTeamTournament(t);
        boolean manager = TournamentGuard.canManage(actor, t);
        if (t.getStatus() != TournamentStatus.PUBLISHED && !(manager && t.getStatus().acceptsRosterChanges())) {
            throw new ApiException(HttpStatus.CONFLICT, "REGISTRATION_CLOSED");
        }
        if (!hasFreeTeamSlot(t)) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAMS_FULL");
        }
        requireNotInTeam(tournamentId, actor.id());
        if (teams.existsByTournamentIdAndNameIgnoreCase(tournamentId, name.trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_NAME_TAKEN");
        }
        Team team = new Team(tournamentId, name, actor.id());
        teams.save(team);
        join(t, team, actor.id(), 1);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_CREATED", team.getName());
        return team.getId();
    }

    @Transactional
    public void rename(CurrentUser actor, UUID tournamentId, UUID teamId, String name) {
        Tournament t = guard.lock(tournamentId);
        Team team = managedTeam(actor, t, teamId);
        if (!team.getName().equalsIgnoreCase(name.trim())
                && teams.existsByTournamentIdAndNameIgnoreCase(tournamentId, name.trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_NAME_TAKEN");
        }
        team.rename(name);
    }

    @Transactional
    public void invite(CurrentUser actor, UUID tournamentId, UUID teamId, UUID userId) {
        Tournament t = guard.lock(tournamentId);
        Team team = managedTeam(actor, t, teamId);
        requireRosterOpen(t);
        User user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND"));
        requireNotInTeam(tournamentId, userId);
        if (members.findByTeamIdAndUserId(teamId, userId).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_INVITED");
        }
        requireSpace(t, team);
        members.save(new TeamMember(teamId, tournamentId, userId, nextPosition(teamId), TeamMemberStatus.INVITED));
        notifications.notify(userId, NotificationType.TEAM_INVITATION, Map.of("tournament", t.getName(),
                "team", team.getName(), "captain", name(team.getCaptainId())), "/tournaments/" + tournamentId);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_INVITED", team.getName() + ": " + user.getDisplayName());
    }

    @Transactional
    public void accept(CurrentUser actor, UUID tournamentId, UUID teamId) {
        Tournament t = guard.lock(tournamentId);
        requireRosterOpen(t);
        Team team = team(tournamentId, teamId);
        TeamMember m = members.findByTeamIdAndUserId(teamId, actor.id())
                .filter(x -> !x.isAccepted())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "INVITATION_NOT_FOUND"));
        requireNotInTeam(tournamentId, actor.id());
        requireSpace(t, team);
        m.accept();
        addParticipant(tournamentId, actor.id());
        // Other invitations of this player in the same tournament are dropped.
        members.findByTournamentIdAndUserId(tournamentId, actor.id()).stream()
                .filter(x -> !x.isAccepted() && !x.getId().equals(m.getId())).forEach(x -> members.delete(x));
        notifications.notify(team.getCaptainId(), NotificationType.NEW_REGISTRATION, Map.of("tournament", t.getName(),
                "player", name(actor.id()), "team", team.getName(), "waitlist", false), "/tournaments/" + tournamentId);
    }

    @Transactional
    public void decline(CurrentUser actor, UUID tournamentId, UUID teamId) {
        guard.lock(tournamentId);
        members.findByTeamIdAndUserId(teamId, actor.id()).filter(x -> !x.isAccepted()).ifPresent(x -> members.delete(x));
    }

    /** Captain / organizer removes a member or an invitation; a member can leave by removing themself. */
    @Transactional
    public void removeMember(CurrentUser actor, UUID tournamentId, UUID teamId, UUID userId) {
        Tournament t = guard.lock(tournamentId);
        Team team = team(tournamentId, teamId);
        boolean manager = TournamentGuard.canManage(actor, t);
        boolean captain = team.getCaptainId().equals(actor.id());
        if (!manager && !captain && !actor.id().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        TeamMember m = members.findByTeamIdAndUserId(teamId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND"));
        if (m.isAccepted()) {
            requireRosterOpen(t);
            if (team.getCaptainId().equals(userId)) {
                throw new ApiException(HttpStatus.CONFLICT, "CAPTAIN_CANNOT_LEAVE");
            }
            participants.findByTournamentIdAndUserId(tournamentId, userId).ifPresent(x -> participants.delete(x));
        }
        members.delete(m);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_MEMBER_REMOVED", team.getName() + ": " + name(userId));
    }

    /** Default line-up order (board 1 first). */
    @Transactional
    public void reorder(CurrentUser actor, UUID tournamentId, UUID teamId, List<UUID> order) {
        Tournament t = guard.lock(tournamentId);
        managedTeam(actor, t, teamId);
        List<TeamMember> ms = members.findByTeamIdOrderByPositionAsc(teamId);
        Set<UUID> ids = ms.stream().map(TeamMember::getUserId).collect(Collectors.toSet());
        if (order.size() != ids.size() || !ids.equals(new HashSet<>(order))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LINEUP");
        }
        for (TeamMember m : ms) {
            m.setPosition(order.indexOf(m.getUserId()) + 1);
        }
    }

    @Transactional
    public void delete(CurrentUser actor, UUID tournamentId, UUID teamId) {
        Tournament t = guard.lock(tournamentId);
        Team team = managedTeam(actor, t, teamId);
        requireRosterOpen(t);
        for (TeamMember m : members.findByTeamIdOrderByPositionAsc(teamId)) {
            if (m.isAccepted()) {
                participants.findByTournamentIdAndUserId(tournamentId, m.getUserId()).ifPresent(x -> participants.delete(x));
            }
            members.delete(m);
        }
        teams.delete(team);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_DELETED", team.getName());
    }

    // ------------------------------------------------------------------ organizer

    /** Organizer puts a player straight into a team (no invitation needed). */
    @Transactional
    public void addMember(CurrentUser actor, UUID tournamentId, UUID teamId, String displayName) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        Team team = team(tournamentId, teamId);
        requireRosterOpen(t);
        User user = users.findByDisplayNameIgnoreCase(displayName.trim())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND"));
        requireNotInTeam(tournamentId, user.getId());
        requireSpace(t, team);
        members.findByTeamIdAndUserId(teamId, user.getId()).ifPresent(x -> members.delete(x));
        members.flush();
        join(t, team, user.getId(), nextPosition(teamId));
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_MEMBER_ADDED", team.getName() + ": " + user.getDisplayName());
    }

    /** During the tournament: the team stops being paired; its players are dropped. */
    @Transactional
    public void drop(CurrentUser actor, UUID tournamentId, UUID teamId) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        if (t.getStatus() != TournamentStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_IN_PROGRESS");
        }
        Team team = team(tournamentId, teamId);
        team.drop();
        for (TeamMember m : members.findByTeamIdOrderByPositionAsc(teamId)) {
            participants.findByTournamentIdAndUserId(tournamentId, m.getUserId()).ifPresent(TournamentParticipant::drop);
        }
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TEAM_DROPPED", team.getName());
    }

    // ------------------------------------------------------------------ helpers

    private void join(Tournament t, Team team, UUID userId, int position) {
        members.save(new TeamMember(team.getId(), t.getId(), userId, position, TeamMemberStatus.ACCEPTED));
        addParticipant(t.getId(), userId);
    }

    private void addParticipant(UUID tournamentId, UUID userId) {
        if (participants.findByTournamentIdAndUserId(tournamentId, userId).isEmpty()) {
            User user = users.findById(userId).orElseThrow();
            TournamentParticipant p = new TournamentParticipant(tournamentId, userId, ParticipantStatus.REGISTERED);
            p.snapshotProfile(user.getClub(), user.getHomeCity());
            participants.save(p);
        }
    }

    private void requireTeamTournament(Tournament t) {
        if (!t.isTeamTournament()) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_TEAM_TOURNAMENT");
        }
    }

    private static void requireRosterOpen(Tournament t) {
        if (!t.getStatus().acceptsRosterChanges()) {
            throw new ApiException(HttpStatus.CONFLICT, "ROSTER_LOCKED");
        }
    }

    private void requireNotInTeam(UUID tournamentId, UUID userId) {
        if (members.findByTournamentIdAndUserIdAndStatus(tournamentId, userId, TeamMemberStatus.ACCEPTED).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_IN_TEAM");
        }
    }

    /** Accepted members plus open invitations may not exceed the team size. */
    private void requireSpace(Tournament t, Team team) {
        long taken = members.findByTeamIdOrderByPositionAsc(team.getId()).size();
        long accepted = members.countByTeamIdAndStatus(team.getId(), TeamMemberStatus.ACCEPTED);
        if (accepted >= t.getTeamSize() || taken > t.getTeamSize() + 2L) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_FULL");
        }
    }

    private boolean hasFreeTeamSlot(Tournament t) {
        return t.getMaxPlayers() == null || teams.countByTournamentId(t.getId()) < t.getMaxPlayers();
    }

    private int nextPosition(UUID teamId) {
        return members.findByTeamIdOrderByPositionAsc(teamId).stream().mapToInt(TeamMember::getPosition).max().orElse(0) + 1;
    }

    private Team team(UUID tournamentId, UUID teamId) {
        return teams.findById(teamId).filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND"));
    }

    private Team managedTeam(CurrentUser actor, Tournament t, UUID teamId) {
        Team team = team(t.getId(), teamId);
        if (!TournamentGuard.canManage(actor, t) && !team.getCaptainId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        return team;
    }

    private Map<UUID, String> names(Set<UUID> ids) {
        return users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
    }

    private String name(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse("?");
    }
}
