package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.repo.TeamRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.ListStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentDetails;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentRoundPlan;
import com.skirmishchronicle.tournament.repo.RoundPlanRepository;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import com.skirmishchronicle.tournament.domain.DifferenceRow;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TournamentService {

    public enum Tab {
        UPCOMING, ONGOING, FINISHED
    }

    private static final String AUDIT_TYPE = "TOURNAMENT";

    private final TeamRepository teams;
    private final NotificationService notifications;
    private final TournamentRepository tournaments;
    private final ParticipantRepository participants;
    private final UserRepository users;
    private final AuditService audit;
    private final ChallengeService challenges;
    private final RoundRepository rounds;
    private final RoundPlanRepository roundPlans;
    private final ContentService content;

    public TournamentService(TournamentRepository tournaments, ParticipantRepository participants,
                             UserRepository users, AuditService audit, ChallengeService challenges,
                             RoundRepository rounds, RoundPlanRepository roundPlans, ContentService content,
            NotificationService notifications,
            TeamRepository teams) {
        this.teams = teams;
        this.notifications = notifications;
        this.tournaments = tournaments;
        this.participants = participants;
        this.users = users;
        this.audit = audit;
        this.challenges = challenges;
        this.rounds = rounds;
        this.roundPlans = roundPlans;
        this.content = content;
    }

    // ---------------------------------------------------------------- organizer: tournament

    @Transactional
    public UUID create(CurrentUser actor, TournamentDetails details, TournamentSettings settings,
                       List<TournamentViews.RoundPlan> plans) {
        validate(details);
        validate(settings, details);
        validatePlans(plans);
        Tournament t = new Tournament(actor.id());
        t.updateDetails(details);
        t.updateSettings(settings);
        tournaments.save(t);
        savePlans(t.getId(), plans, 0);
        audit.record(actor.id(), AUDIT_TYPE, t.getId(), "CREATED", t.getName());
        return t.getId();
    }

    @Transactional
    public void update(CurrentUser actor, UUID id, TournamentDetails details, TournamentSettings settings,
                       List<TournamentViews.RoundPlan> plans) {
        validate(details);
        validate(settings, details);
        validatePlans(plans);
        Tournament t = lockManaged(actor, id);
        if (t.getStatus() == TournamentStatus.FINISHED || t.getStatus() == TournamentStatus.CANCELLED) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_EDITABLE");
        }
        if (details.format() != t.getFormat() && rounds.countByTournamentId(id) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "FORMAT_LOCKED");
        }
        if (!java.util.Objects.equals(settings.teamSize(), t.getTeamSize())
                && (rounds.countByTournamentId(id) > 0 || teams.countByTournamentId(id) > 0
                || (t.getTeamSize() == null && participants.countByTournamentIdAndStatus(id, ParticipantStatus.REGISTERED) > 0))) {
            // Switching between individual and team mode (or the team size) only while nobody has signed up.
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_SIZE_LOCKED");
        }
        // In a team tournament the limit counts teams.
        long registered = t.isTeamTournament() ? teams.countByTournamentId(id)
                : participants.countByTournamentIdAndStatus(id, ParticipantStatus.REGISTERED);
        if (details.maxPlayers() != null && details.maxPlayers() < registered) {
            throw new ApiException(HttpStatus.CONFLICT, "MAX_PLAYERS_BELOW_REGISTERED");
        }
        t.updateDetails(details);
        t.updateSettings(settings);
        if (plans != null) {
            // Rounds already generated keep their plan; the rest is replaced.
            savePlans(id, plans, (int) rounds.countByTournamentId(id));
        }
        if (t.getStatus() != TournamentStatus.IN_PROGRESS) {
            promoteFromWaitlist(t);
        }
        audit.record(actor.id(), AUDIT_TYPE, id, "UPDATED", null);
    }

    @Transactional
    public void changeStatus(CurrentUser actor, UUID id, TournamentStatus target) {
        Tournament t = lockManaged(actor, id);
        TournamentStatus current = t.getStatus();
        boolean allowed = switch (target) {
            case PUBLISHED -> current == TournamentStatus.DRAFT || current == TournamentStatus.REGISTRATION_CLOSED;
            case REGISTRATION_CLOSED -> current == TournamentStatus.PUBLISHED;
            case CANCELLED -> current != TournamentStatus.FINISHED && current != TournamentStatus.CANCELLED;
            // IN_PROGRESS / FINISHED are driven by rounds (next step), DRAFT is never re-entered.
            default -> false;
        };
        if (!allowed) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATUS_TRANSITION");
        }
        t.changeStatus(target);
        audit.record(actor.id(), AUDIT_TYPE, id, "STATUS_" + target.name(), current.name() + " -> " + target.name());
    }

    // ---------------------------------------------------------------- public reads

    @Transactional(readOnly = true)
    public TournamentViews.Page<TournamentViews.Summary> list(Tab tab, String city, TournamentRank rank,
                                                              int page, int size) {
        Specification<Tournament> spec = statusIn(switch (tab) {
            case UPCOMING -> EnumSet.of(TournamentStatus.PUBLISHED, TournamentStatus.REGISTRATION_CLOSED);
            case ONGOING -> EnumSet.of(TournamentStatus.IN_PROGRESS);
            case FINISHED -> EnumSet.of(TournamentStatus.FINISHED);
        });
        if (city != null && !city.isBlank()) {
            String pattern = "%" + city.trim().toLowerCase().replace("%", "").replace("_", "") + "%";
            spec = spec.and((root, q, cb) -> cb.like(cb.lower(root.get("city")), pattern));
        }
        if (rank != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("rank"), rank));
        }
        Sort sort = tab == Tab.FINISHED ? Sort.by("startsAt").descending() : Sort.by("startsAt").ascending();
        var result = tournaments.findAll(spec, PageRequest.of(page, size, sort));
        return new TournamentViews.Page<>(summaries(result.getContent()), page, size, result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public TournamentViews.Detail detail(CurrentUser viewer, UUID id) {
        Tournament t = visible(viewer, id);
        User owner = users.findById(t.getOwnerId()).orElseThrow();
        ParticipantStatus mine = viewer == null ? null
                : participants.findByTournamentIdAndUserId(id, viewer.id())
                        .map(TournamentParticipant::getStatus).orElse(null);
        return new TournamentViews.Detail(t.getId(), t.getName(), t.getDescription(), t.getStartsAt(),
                t.getEndsAt(), t.getVenueName(), t.getAddress(), t.getCity(), t.getCountry(),
                t.getEntryFeeAmount(), t.getEntryFeeCurrency(), t.getRank(), t.getFormat(), t.getMaxPlayers(),
                t.getPointsLimit(), t.getRoundsPlanned(), t.getListDeadline(), t.getStatus(),
                new TournamentViews.Organizer(owner.getId(), owner.getDisplayName()),
                participants.countByTournamentIdAndStatus(id, ParticipantStatus.REGISTERED),
                participants.countByTournamentIdAndStatus(id, ParticipantStatus.WAITLIST),
                mine, canManage(viewer, t), t.settings(), rounds.countByTournamentId(id),
                roundPlans.findByTournamentIdOrderByNumberAsc(id).stream()
                        .map(p -> new TournamentViews.RoundPlan(p.getNumber(), p.getScenarioCode(), p.getPairing(),
                                p.getTableOrder(), p.getSoftPreferences(), p.getDurationMinutes())).toList());
    }

    @Transactional(readOnly = true)
    public List<TournamentViews.Participant> participants(CurrentUser viewer, UUID id) {
        Tournament t = visible(viewer, id);
        boolean manager = canManage(viewer, t);
        List<TournamentParticipant> rows = participants.findByTournamentIdOrderByStatusAscRegisteredAtAsc(id);
        Map<UUID, String> names = displayNames(rows.stream().map(TournamentParticipant::getUserId).toList());
        return rows.stream().map(p -> new TournamentViews.Participant(p.getId(), p.getUserId(),
                names.getOrDefault(p.getUserId(), "?"), p.getStatus(), p.getRegisteredAt(),
                manager ? p.isPaid() : null, manager ? p.getListStatus() : null, p.getClub(),
                manager ? p.getCity() : null, p.isDropped())).toList();
    }

    @Transactional(readOnly = true)
    public List<TournamentViews.AuditItem> auditLog(CurrentUser actor, UUID id) {
        Tournament t = tournaments.findById(id).orElseThrow(TournamentService::notFound);
        requireManager(actor, t);
        var entries = audit.recent(AUDIT_TYPE, id);
        Map<UUID, String> names = displayNames(entries.stream().map(e -> e.getActorId()).toList());
        return entries.stream().map(e -> new TournamentViews.AuditItem(e.getCreatedAt(),
                names.getOrDefault(e.getActorId(), "?"), e.getAction(), e.getDetails())).toList();
    }

    @Transactional(readOnly = true)
    public TournamentViews.MyTournaments mine(CurrentUser actor) {
        List<Tournament> organized = tournaments.findByOwnerIdOrderByStartsAtDesc(actor.id());
        Set<UUID> joinedIds = participants.findByUserId(actor.id()).stream()
                .map(TournamentParticipant::getTournamentId).collect(Collectors.toSet());
        List<Tournament> joined = tournaments.findAllById(joinedIds).stream()
                .filter(t -> t.getStatus().isPublic())
                .sorted(Comparator.comparing(Tournament::getStartsAt).reversed()).toList();
        return new TournamentViews.MyTournaments(summaries(organized), summaries(joined));
    }

    // ---------------------------------------------------------------- player registration

    @Transactional
    public ParticipantStatus register(CurrentUser actor, UUID id) {
        Tournament t = tournaments.findByIdForUpdate(id).orElseThrow(TournamentService::notFound);
        if (t.getStatus() != TournamentStatus.PUBLISHED) {
            throw new ApiException(HttpStatus.CONFLICT, "REGISTRATION_CLOSED");
        }
        if (t.isTeamTournament()) {
            // Players of a team tournament join through a team (captain creates it and invites them).
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_TOURNAMENT");
        }
        if (participants.findByTournamentIdAndUserId(id, actor.id()).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REGISTERED");
        }
        ParticipantStatus status = hasFreeSlot(t) ? ParticipantStatus.REGISTERED : ParticipantStatus.WAITLIST;
        User user = users.findById(actor.id()).orElseThrow();
        TournamentParticipant p = new TournamentParticipant(id, actor.id(), status);
        p.snapshotProfile(user.getClub(), user.getHomeCity());
        participants.save(p);
        notifications.notify(t.getOwnerId(), NotificationType.NEW_REGISTRATION, Map.of("tournament", t.getName(),
                "player", user.getDisplayName(), "waitlist", status == ParticipantStatus.WAITLIST),
                "/tournaments/" + id + "/manage");
        return status;
    }

    @Transactional
    public void withdraw(CurrentUser actor, UUID id) {
        Tournament t = tournaments.findByIdForUpdate(id).orElseThrow(TournamentService::notFound);
        if (t.isTeamTournament()) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_TOURNAMENT");
        }
        if (!t.getStatus().acceptsRosterChanges()) {
            throw new ApiException(HttpStatus.CONFLICT, "ROSTER_LOCKED");
        }
        TournamentParticipant p = participants.findByTournamentIdAndUserId(id, actor.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_REGISTERED"));
        participants.delete(p);
        participants.flush();
        challenges.cancelAllOf(id, actor.id());
        promoteFromWaitlist(t);
    }

    // ---------------------------------------------------------------- organizer: players

    @Transactional
    public void addPlayer(CurrentUser actor, UUID id, String displayName) {
        Tournament t = lockManaged(actor, id);
        boolean inProgress = t.getStatus() == TournamentStatus.IN_PROGRESS;
        if (!t.getStatus().acceptsRosterChanges() && !inProgress) {
            throw new ApiException(HttpStatus.CONFLICT, "ROSTER_LOCKED");
        }
        if (t.isTeamTournament()) {
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_TOURNAMENT");
        }
        User user = users.findByDisplayNameIgnoreCase(displayName.trim())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND"));
        if (participants.findByTournamentIdAndUserId(id, user.getId()).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_REGISTERED");
        }
        // A late entry during the tournament always plays (joins from the next round).
        ParticipantStatus status = inProgress || hasFreeSlot(t) ? ParticipantStatus.REGISTERED : ParticipantStatus.WAITLIST;
        TournamentParticipant added = new TournamentParticipant(id, user.getId(), status);
        added.snapshotProfile(user.getClub(), user.getHomeCity());
        participants.save(added);
        audit.record(actor.id(), AUDIT_TYPE, id, "PLAYER_ADDED", user.getDisplayName() + " (" + status + ")");
    }

    @Transactional
    public void removePlayer(CurrentUser actor, UUID id, UUID participantId) {
        Tournament t = lockManaged(actor, id);
        if (t.isTeamTournament()) {
            // Players of a team tournament are managed through their team.
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_TOURNAMENT");
        }
        TournamentParticipant p = participantOf(id, participantId);
        String name = users.findById(p.getUserId()).map(User::getDisplayName).orElse("?");
        if (t.getStatus() == TournamentStatus.IN_PROGRESS) {
            // Played games stay in the history; the player is just not paired any more.
            p.drop();
            audit.record(actor.id(), AUDIT_TYPE, id, "PLAYER_DROPPED", name);
            return;
        }
        if (!t.getStatus().acceptsRosterChanges()) {
            throw new ApiException(HttpStatus.CONFLICT, "ROSTER_LOCKED");
        }
        challenges.cancelAllOf(id, p.getUserId());
        participants.delete(p);
        participants.flush();
        promoteFromWaitlist(t);
        audit.record(actor.id(), AUDIT_TYPE, id, "PLAYER_REMOVED", name);
    }

    @Transactional
    public void updateParticipant(CurrentUser actor, UUID id, UUID participantId, Boolean paid,
                                  ListStatus listStatus) {
        Tournament t = tournaments.findById(id).orElseThrow(TournamentService::notFound);
        requireManager(actor, t);
        TournamentParticipant p = participantOf(id, participantId);
        String name = users.findById(p.getUserId()).map(User::getDisplayName).orElse("?");
        if (paid != null && paid != p.isPaid()) {
            p.setPaid(paid);
            audit.record(actor.id(), AUDIT_TYPE, id, paid ? "MARKED_PAID" : "MARKED_UNPAID", name);
        }
        if (listStatus != null && listStatus != p.getListStatus()) {
            p.setListStatus(listStatus);
            audit.record(actor.id(), AUDIT_TYPE, id, "LIST_" + listStatus.name(), name);
            notifications.notify(p.getUserId(), NotificationType.LIST_STATUS_CHANGED,
                    Map.of("tournament", t.getName(), "status", listStatus.name()), "/tournaments/" + id + "/warband");
        }
    }

    // ---------------------------------------------------------------- helpers

    private void validate(TournamentSettings st, TournamentDetails d) {
        if (!TournamentSettings.TOP_CUTS.contains(st.topCut())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TOP_CUT");
        }
        if (st.topCut() > 0 && d.format() == TournamentFormat.SWISS && d.roundsPlanned() == null) {
            // The bracket starts after the planned Swiss rounds, so their number must be known.
            throw new ApiException(HttpStatus.BAD_REQUEST, "TOP_CUT_REQUIRES_ROUNDS");
        }
        String tableError = DifferenceRow.validate(st.differenceTable());
        if (tableError != null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, tableError);
        }
    }

    private void validatePlans(List<TournamentViews.RoundPlan> plans) {
        if (plans == null) {
            return;
        }
        Set<Integer> numbers = new HashSet<>();
        for (TournamentViews.RoundPlan p : plans) {
            if (p.number() < 1 || p.number() > 30 || !numbers.add(p.number())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ROUND_PLAN");
            }
            if (p.scenarioCode() != null && content.quest(p.scenarioCode()).isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "SCENARIO_NOT_FOUND");
            }
        }
    }

    private void savePlans(UUID tournamentId, List<TournamentViews.RoundPlan> plans, int generatedRounds) {
        if (plans == null) {
            return;
        }
        List<TournamentRoundPlan> old = roundPlans.findByTournamentIdOrderByNumberAsc(tournamentId).stream()
                .filter(p -> p.getNumber() > generatedRounds).toList();
        roundPlans.deleteAll(old);
        roundPlans.flush();
        for (TournamentViews.RoundPlan p : plans) {
            if (p.number() > generatedRounds) {
                roundPlans.save(new TournamentRoundPlan(tournamentId, p.number(), p.scenarioCode(), p.pairing(),
                        p.tableOrder(), p.softPreferences(), p.durationMinutes()));
            }
        }
    }

    private void validate(TournamentDetails d) {
        if (d.endsAt() != null && d.endsAt().isBefore(d.startsAt())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "END_BEFORE_START");
        }
    }

    private boolean hasFreeSlot(Tournament t) {
        return t.getMaxPlayers() == null
                || participants.countByTournamentIdAndStatus(t.getId(), ParticipantStatus.REGISTERED) < t.getMaxPlayers();
    }

    /** Moves the earliest waitlisted players up while there is room. Caller must hold the tournament lock. */
    private void promoteFromWaitlist(Tournament t) {
        List<TournamentParticipant> waiting =
                participants.findByTournamentIdAndStatusOrderByRegisteredAtAsc(t.getId(), ParticipantStatus.WAITLIST);
        long registered = participants.countByTournamentIdAndStatus(t.getId(), ParticipantStatus.REGISTERED);
        for (TournamentParticipant p : waiting) {
            if (t.getMaxPlayers() != null && registered >= t.getMaxPlayers()) {
                break;
            }
            p.promote();
            registered++;
            notifications.notify(p.getUserId(), NotificationType.PROMOTED_FROM_WAITLIST,
                    Map.of("tournament", t.getName()), "/tournaments/" + t.getId());
        }
    }

    private Tournament lockManaged(CurrentUser actor, UUID id) {
        Tournament t = tournaments.findByIdForUpdate(id).orElseThrow(TournamentService::notFound);
        requireManager(actor, t);
        return t;
    }

    private Tournament visible(CurrentUser viewer, UUID id) {
        Tournament t = tournaments.findById(id).orElseThrow(TournamentService::notFound);
        if (!t.getStatus().isPublic() && !canManage(viewer, t)) {
            // Drafts do not exist for anyone but the organizer.
            throw notFound();
        }
        return t;
    }

    private TournamentParticipant participantOf(UUID tournamentId, UUID participantId) {
        TournamentParticipant p = participants.findById(participantId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PARTICIPANT_NOT_FOUND"));
        if (!p.getTournamentId().equals(tournamentId)) {
            // Never act on a participant through another tournament's URL (IDOR).
            throw new ApiException(HttpStatus.NOT_FOUND, "PARTICIPANT_NOT_FOUND");
        }
        return p;
    }

    private static boolean canManage(CurrentUser viewer, Tournament t) {
        return viewer != null && (viewer.admin() || t.isOwnedBy(viewer.id()));
    }

    private static void requireManager(CurrentUser actor, Tournament t) {
        if (!canManage(actor, t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND");
    }

    private static Specification<Tournament> statusIn(Set<TournamentStatus> statuses) {
        return (root, q, cb) -> root.get("status").in(statuses);
    }

    private List<TournamentViews.Summary> summaries(List<Tournament> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = list.stream().map(Tournament::getId).toList();
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : participants.countByTournamentIds(ids, ParticipantStatus.REGISTERED)) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        Map<UUID, String> owners = displayNames(list.stream().map(Tournament::getOwnerId).toList());
        return list.stream().map(t -> new TournamentViews.Summary(t.getId(), t.getName(), t.getStartsAt(),
                t.getCity(), t.getVenueName(), t.getRank(), t.getFormat(), t.getStatus(), t.getMaxPlayers(),
                counts.getOrDefault(t.getId(), 0L), t.getPointsLimit(),
                owners.getOrDefault(t.getOwnerId(), "?"))).toList();
    }

    private Map<UUID, String> displayNames(Collection<UUID> ids) {
        return users.findAllById(Set.copyOf(ids)).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
    }
}
