package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.repo.TeamMemberRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.content.ArmyContent;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.ListStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.domain.Warband;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.WarbandRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Warband lists for a tournament. The only hard rule is the points sum (characters from the imported army
 * lists plus manually entered extra points for items/upgrades) against the tournament limit; the leader's
 * INT is stored so the scheme draw can use it.
 */
@Service
public class WarbandService {

    public static final int MAX_UNITS = 20;
    public static final int MAX_EXTRA_POINTS = 200;
    public static final int MAX_NOTES = 200;
    public static final int MAX_ITEMS_PER_UNIT = 10;

    private static final String AUDIT_TYPE = "TOURNAMENT";
    private static final TypeReference<List<StoredUnit>> STORED = new TypeReference<>() {
    };

    /** An upgrade/item bought for a character; {@code reduced} selects the cheaper conditional cost. */
    public record ItemInput(String item, boolean reduced) {
    }

    /** Input for one character in the list. {@code extraPoints} covers costs not in the item list. */
    public record UnitInput(String unit, int extraPoints, String notes, boolean leader, List<ItemInput> items) {
    }

    public record SaveInput(String faction, String alliedFaction, int leaderInt, List<UnitInput> units) {
    }

    /** JSON shape persisted in warbands.units. */
    public record StoredUnit(String unit, int extraPoints, String notes, boolean leader, List<ItemInput> items) {
    }

    public record ItemView(String item, String name, int points, boolean reduced) {
    }

    public record UnitView(String unit, String name, int points, int extraPoints, String notes, boolean leader,
                           String source, List<ItemView> items, int totalPoints) {
    }

    public record WarbandView(UUID userId, String displayName, String faction, String alliedFaction, int leaderInt,
                              int totalPoints, Integer pointsLimit, List<UnitView> units, ListStatus listStatus,
                              Instant updatedAt, boolean editable) {
    }

    /** Own list (may be empty) plus whether the caller may still edit it. */
    public record MyWarband(WarbandView warband, boolean editable, Integer pointsLimit, Instant listDeadline) {
    }

    public record Summary(UUID userId, String displayName, String faction, String alliedFaction, int totalPoints,
                          ListStatus listStatus, Instant updatedAt) {
    }

    private final TeamMemberRepository teamMembers;
    private final NotificationService notifications;
    private final WarbandRepository warbands;
    private final ParticipantRepository participants;
    private final RoundRepository rounds;
    private final UserRepository users;
    private final ContentService content;
    private final TournamentGuard guard;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public WarbandService(WarbandRepository warbands, ParticipantRepository participants, RoundRepository rounds,
                          UserRepository users, ContentService content, TournamentGuard guard, AuditService audit,
                          ObjectMapper mapper,
            NotificationService notifications,
            TeamMemberRepository teamMembers) {
        this.teamMembers = teamMembers;
        this.notifications = notifications;
        this.warbands = warbands;
        this.participants = participants;
        this.rounds = rounds;
        this.users = users;
        this.content = content;
        this.guard = guard;
        this.audit = audit;
        this.mapper = mapper;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public MyWarband mine(CurrentUser actor, UUID tournamentId) {
        Tournament t = guard.visible(actor, tournamentId);
        TournamentParticipant p = participants.findByTournamentIdAndUserId(tournamentId, actor.id())
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PARTICIPANT"));
        boolean editable = playerMayEdit(t, p);
        WarbandView view = warbands.findByTournamentIdAndUserId(tournamentId, actor.id())
                .map(w -> view(w, t, p.getListStatus(), editable)).orElse(null);
        return new MyWarband(view, editable, t.getPointsLimit(), t.getListDeadline());
    }

    @Transactional(readOnly = true)
    public List<Summary> list(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        boolean manager = TournamentGuard.canManage(viewer, t);
        if (!manager && !listsPublic(t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WARBANDS_HIDDEN");
        }
        List<Warband> rows = warbands.findByTournamentId(tournamentId);
        Map<UUID, TournamentParticipant> byUser = participants.findByTournamentIdOrderByStatusAscRegisteredAtAsc(
                tournamentId).stream().collect(Collectors.toMap(TournamentParticipant::getUserId, p -> p));
        Map<UUID, String> names = names(rows.stream().map(Warband::getUserId).toList());
        return rows.stream()
                .filter(w -> byUser.containsKey(w.getUserId()))
                .map(w -> new Summary(w.getUserId(), names.getOrDefault(w.getUserId(), "?"), w.getFaction(),
                        w.getAlliedFaction(), w.getTotalPoints(), byUser.get(w.getUserId()).getListStatus(),
                        w.getUpdatedAt()))
                .sorted((a, b) -> a.displayName().compareToIgnoreCase(b.displayName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public WarbandView get(CurrentUser viewer, UUID tournamentId, UUID userId) {
        Tournament t = guard.visible(viewer, tournamentId);
        boolean manager = TournamentGuard.canManage(viewer, t);
        boolean own = viewer != null && viewer.id().equals(userId);
        if (!manager && !own && !listsPublic(t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WARBANDS_HIDDEN");
        }
        TournamentParticipant p = participants.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseThrow(WarbandService::notFound);
        Warband w = warbands.findByTournamentIdAndUserId(tournamentId, userId).orElseThrow(WarbandService::notFound);
        boolean editable = manager ? organizerMayEdit(t) : own && playerMayEdit(t, p);
        return view(w, t, p.getListStatus(), editable);
    }

    /** Faction and leader INT from the player's list, used as defaults for the scheme draw. */
    @Transactional(readOnly = true)
    public Optional<Warband> find(UUID tournamentId, UUID userId) {
        return warbands.findByTournamentIdAndUserId(tournamentId, userId);
    }

    // ------------------------------------------------------------------ write

    @Transactional
    public WarbandView save(CurrentUser actor, UUID tournamentId, UUID userId, SaveInput input) {
        Tournament t = guard.lock(tournamentId);
        if (!t.getStatus().isPublic() && !TournamentGuard.canManage(actor, t)) {
            throw TournamentGuard.notFound();
        }
        boolean manager = TournamentGuard.canManage(actor, t);
        boolean own = actor.id().equals(userId);
        if (!own && !manager) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        TournamentParticipant p = participants.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseThrow(() -> own ? new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PARTICIPANT") : notFound());
        if (manager ? !organizerMayEdit(t) : !playerMayEdit(t, p)) {
            throw new ApiException(HttpStatus.CONFLICT, "WARBAND_LOCKED");
        }

        Validated v = validate(t, input);
        if (t.isTeamTournament() && t.settings().teamUniqueFactions()) {
            requireFactionFreeInTeam(tournamentId, userId, v.faction);
        }
        Warband w = warbands.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseGet(() -> new Warband(tournamentId, userId));
        w.update(v.faction, v.allied, input.leaderInt(), v.total, write(v.units));
        warbands.save(w);
        p.setFaction(v.faction);
        if (own && !manager) {
            // Any change by the player sends the list back to the organizer for review.
            p.setListStatus(ListStatus.SUBMITTED);
        } else if (p.getListStatus() == ListStatus.NOT_SUBMITTED) {
            p.setListStatus(ListStatus.SUBMITTED);
        }
        if (own && !manager) {
            notifications.notify(t.getOwnerId(), NotificationType.WARBAND_SUBMITTED, Map.of("tournament", t.getName(),
                    "player", name(userId)), "/tournaments/" + tournamentId + "/warbands/" + userId);
        }
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, own ? "WARBAND_SAVED" : "WARBAND_EDITED_BY_ORGANIZER",
                name(userId) + ": " + v.faction + (v.allied == null ? "" : " + " + v.allied) + ", " + v.total + " pts");
        return view(w, t, p.getListStatus(), true);
    }

    // ------------------------------------------------------------------ rules

    /** Organizer option: no two players of one team may play the same main faction. */
    private void requireFactionFreeInTeam(UUID tournamentId, UUID userId, String faction) {
        teamMembers.findByTournamentIdAndUserIdAndStatus(tournamentId, userId,
                com.skirmishchronicle.tournament.domain.TeamMemberStatus.ACCEPTED).ifPresent(me -> {
            boolean taken = teamMembers.findByTeamIdOrderByPositionAsc(me.getTeamId()).stream()
                    .filter(m -> m.isAccepted() && !m.getUserId().equals(userId))
                    .map(m -> warbands.findByTournamentIdAndUserId(tournamentId, m.getUserId()))
                    .anyMatch(w -> w.isPresent() && faction.equals(w.get().getFaction()));
            if (taken) {
                throw new ApiException(HttpStatus.CONFLICT, "FACTION_TAKEN_IN_TEAM");
            }
        });
    }

    /** Player edits: registered participant, before the list deadline and before round 1 is paired. */
    private boolean playerMayEdit(Tournament t, TournamentParticipant p) {
        if (p.getStatus() != ParticipantStatus.REGISTERED && p.getStatus() != ParticipantStatus.WAITLIST) {
            return false;
        }
        if (!t.getStatus().acceptsRosterChanges() || rounds.countByTournamentId(t.getId()) > 0) {
            return false;
        }
        return t.getListDeadline() == null || Instant.now().isBefore(t.getListDeadline());
    }

    /** Organizer can fix lists until the tournament ends. */
    private static boolean organizerMayEdit(Tournament t) {
        return t.getStatus() != TournamentStatus.FINISHED && t.getStatus() != TournamentStatus.CANCELLED;
    }

    /** Other players see lists once the deadline passed or the event started. */
    private static boolean listsPublic(Tournament t) {
        TournamentStatus s = t.getStatus();
        if (s == TournamentStatus.IN_PROGRESS || s == TournamentStatus.FINISHED) {
            return true;
        }
        return t.getListDeadline() != null && !Instant.now().isBefore(t.getListDeadline());
    }

    private record Validated(String faction, String allied, int total, List<StoredUnit> units) {
    }

    private Validated validate(Tournament t, SaveInput input) {
        ArmyContent.ArmyFaction faction = input.faction() == null ? null
                : content.armyFaction(input.faction()).filter(ArmyContent.ArmyFaction::playable).orElse(null);
        if (faction == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FACTION_NOT_FOUND");
        }
        String allied = input.alliedFaction() == null || input.alliedFaction().isBlank()
                ? null : input.alliedFaction();
        if (allied != null && !faction.optionalAllies().contains(allied)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ALLY");
        }
        if (input.leaderInt() < 1 || input.leaderInt() > 30) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LEADER_INT");
        }
        List<UnitInput> units = input.units() == null ? List.of() : input.units();
        if (units.isEmpty() || units.size() > MAX_UNITS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WARBAND_SIZE");
        }
        Set<String> allowed = allowedUnits(faction, allied);
        // Neutral items for everyone, faction items only for that faction's warbands; no per-item limits.
        Set<String> allowedItems = content.itemsFor(faction.code());
        int leaders = 0;
        int total = 0;
        List<StoredUnit> stored = new ArrayList<>();
        for (UnitInput u : units) {
            if (u == null || u.unit() == null || !allowed.contains(u.unit())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "UNIT_NOT_ALLOWED");
            }
            if (u.extraPoints() < 0 || u.extraPoints() > MAX_EXTRA_POINTS) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXTRA_POINTS");
            }
            String notes = u.notes() == null || u.notes().isBlank() ? null : u.notes().strip();
            if (notes != null && notes.length() > MAX_NOTES) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_NOTES");
            }
            if (u.leader()) {
                leaders++;
            }
            List<ItemInput> items = u.items() == null ? List.of() : u.items();
            if (items.size() > MAX_ITEMS_PER_UNIT) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_MANY_ITEMS");
            }
            List<ItemInput> storedItems = new ArrayList<>();
            for (ItemInput i : items) {
                ArmyContent.Item item = i == null || i.item() == null || !allowedItems.contains(i.item()) ? null
                        : content.item(i.item()).orElse(null);
                if (item == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "ITEM_NOT_ALLOWED");
                }
                boolean reduced = i.reduced() && item.reducedPoints() != null;
                total += reduced ? item.reducedPoints() : item.points();
                storedItems.add(new ItemInput(item.code(), reduced));
            }
            ArmyContent.Unit unit = content.unit(u.unit()).orElseThrow();
            total += unit.points() + u.extraPoints();
            stored.add(new StoredUnit(u.unit(), u.extraPoints(), notes, u.leader(), storedItems));
        }
        if (leaders != 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WARBAND_LEADER_REQUIRED");
        }
        if (t.getPointsLimit() != null && total > t.getPointsLimit()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WARBAND_OVER_LIMIT");
        }
        return new Validated(faction.code(), allied, total, stored);
    }

    /** Own list, always-available lists (Adventurers Guild) and the chosen ally. Shared characters have one code. */
    private Set<String> allowedUnits(ArmyContent.ArmyFaction faction, String allied) {
        Set<String> sources = new LinkedHashSet<>();
        sources.add(faction.code());
        sources.addAll(faction.alwaysAvailable());
        if (allied != null) {
            sources.add(allied);
        }
        Set<String> codes = new LinkedHashSet<>();
        for (String s : sources) {
            codes.addAll(content.armies().lists().getOrDefault(s, List.of()));
        }
        return codes;
    }

    /** Which list a unit came from, preferring the player's own faction for shared characters. */
    private String sourceOf(String unit, Warband w) {
        Map<String, List<String>> lists = content.armies().lists();
        if (lists.getOrDefault(w.getFaction(), List.of()).contains(unit)) {
            return w.getFaction();
        }
        if (w.getAlliedFaction() != null && lists.getOrDefault(w.getAlliedFaction(), List.of()).contains(unit)) {
            return w.getAlliedFaction();
        }
        return content.armyFaction(w.getFaction()).stream()
                .flatMap(f -> f.alwaysAvailable().stream())
                .filter(s -> lists.getOrDefault(s, List.of()).contains(unit))
                .findFirst().orElse(null);
    }

    // ------------------------------------------------------------------ helpers

    private WarbandView view(Warband w, Tournament t, ListStatus status, boolean editable) {
        List<UnitView> units = read(w.getUnits()).stream().map(u -> {
            ArmyContent.Unit unit = content.unit(u.unit()).orElse(null);
            int base = unit == null ? 0 : unit.points();
            List<ItemView> items = (u.items() == null ? List.<ItemInput>of() : u.items()).stream().map(i -> {
                ArmyContent.Item item = content.item(i.item()).orElse(null);
                int cost = item == null ? 0
                        : i.reduced() && item.reducedPoints() != null ? item.reducedPoints() : item.points();
                return new ItemView(i.item(), item == null ? i.item() : item.name(), cost, i.reduced());
            }).toList();
            int sum = base + u.extraPoints() + items.stream().mapToInt(ItemView::points).sum();
            return new UnitView(u.unit(), unit == null ? u.unit() : unit.name(), base, u.extraPoints(), u.notes(),
                    u.leader(), sourceOf(u.unit(), w), items, sum);
        }).toList();
        return new WarbandView(w.getUserId(), name(w.getUserId()), w.getFaction(), w.getAlliedFaction(),
                w.getLeaderInt(), w.getTotalPoints(), t.getPointsLimit(), units, status, w.getUpdatedAt(), editable);
    }

    private String write(List<StoredUnit> units) {
        try {
            return mapper.writeValueAsString(units);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private List<StoredUnit> read(String json) {
        try {
            return mapper.readValue(json, STORED);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String name(UUID userId) {
        return users.findById(userId).map(User::getDisplayName).orElse("?");
    }

    private Map<UUID, String> names(List<UUID> ids) {
        return users.findAllById(Set.copyOf(ids)).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "WARBAND_NOT_FOUND");
    }
}
