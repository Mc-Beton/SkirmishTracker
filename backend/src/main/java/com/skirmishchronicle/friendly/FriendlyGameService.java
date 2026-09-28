package com.skirmishchronicle.friendly;

import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.content.ArmyContent;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.league.League;
import com.skirmishchronicle.league.LeagueMemberRepository;
import com.skirmishchronicle.league.LeagueRepository;
import java.time.LocalDate;
import java.time.ZoneOffset;
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

/** Own games: one player reports, the opponent confirms (only then the game counts for ELO and the league). */
@Service
public class FriendlyGameService {

    public static final int MAX_PENDING = 20;
    private static final String AUDIT_TYPE = "FRIENDLY_GAME";

    public record Report(UUID opponentId, int myScore, int opponentScore, LocalDate playedOn, String scenarioCode,
                         String myFaction, String opponentFaction, UUID leagueId, String notes,
                         GameList myList, GameList opponentList) {
    }

    public static final int MAX_LIST_UNITS = 20;
    public static final int MAX_LIST_ITEMS = 10;

    public record PlayerRef(UUID id, String displayName) {
    }

    public record LeagueRef(UUID id, String name) {
    }

    public record GameView(UUID id, PlayerRef playerA, PlayerRef playerB, int smallA, int smallB, LocalDate playedOn,
                           String scenario, String factionA, String factionB, LeagueRef league, String notes,
                           FriendlyGameStatus status, UUID reportedBy, boolean canConfirm, boolean canWithdraw,
                           GameList listA, GameList listB) {
    }

    private final NotificationService notifications;
    private final FriendlyGameRepository games;
    private final UserRepository users;
    private final LeagueRepository leagues;
    private final LeagueMemberRepository members;
    private final ContentService content;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public FriendlyGameService(FriendlyGameRepository games, UserRepository users, LeagueRepository leagues,
                               LeagueMemberRepository members, ContentService content, AuditService audit,
                               ObjectMapper mapper,
            NotificationService notifications) {
        this.notifications = notifications;
        this.games = games;
        this.users = users;
        this.leagues = leagues;
        this.members = members;
        this.content = content;
        this.audit = audit;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<GameView> mine(CurrentUser actor) {
        return views(games.findForPlayer(actor.id()), actor);
    }

    /** Confirmed games of a player (public, for the profile). */
    @Transactional(readOnly = true)
    public List<GameView> confirmedOf(UUID userId) {
        return views(games.findForPlayer(userId).stream()
                .filter(g -> g.getStatus() == FriendlyGameStatus.CONFIRMED).toList(), null);
    }

    @Transactional
    public UUID report(CurrentUser actor, Report r) {
        if (r.opponentId().equals(actor.id())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_PLAY_SELF");
        }
        if (!users.existsById(r.opponentId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND");
        }
        if (r.myScore() < 0 || r.opponentScore() < 0 || r.myScore() > 1000 || r.opponentScore() > 1000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE");
        }
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        // One day of slack for time zones; games older than a year are not accepted.
        if (r.playedOn().isAfter(today.plusDays(1)) || r.playedOn().isBefore(today.minusDays(366))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_GAME_DATE");
        }
        if (r.scenarioCode() != null && content.quest(r.scenarioCode()).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SCENARIO_NOT_FOUND");
        }
        for (String f : new String[] {r.myFaction(), r.opponentFaction()}) {
            if (f != null && content.armyFaction(f).filter(ArmyContent.ArmyFaction::playable).isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "FACTION_NOT_FOUND");
            }
        }
        if (r.leagueId() != null) {
            League league = leagues.findById(r.leagueId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "LEAGUE_NOT_FOUND"));
            if (!league.isOwnGamesAllowed()) {
                throw new ApiException(HttpStatus.CONFLICT, "LEAGUE_OWN_GAMES_DISABLED");
            }
            if (!members.existsByLeagueIdAndUserId(league.getId(), actor.id())
                    || !members.existsByLeagueIdAndUserId(league.getId(), r.opponentId())) {
                throw new ApiException(HttpStatus.CONFLICT, "NOT_LEAGUE_MEMBERS");
            }
            if (!league.covers(r.playedOn())) {
                throw new ApiException(HttpStatus.CONFLICT, "OUTSIDE_LEAGUE_SEASON");
            }
        }
        if (games.countByReportedByAndStatus(actor.id(), FriendlyGameStatus.PENDING) >= MAX_PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_PENDING_GAMES");
        }
        GameList myList = validateList(r.myList());
        GameList opponentList = validateList(r.opponentList());
        // A list decides the faction; the plain faction fields are for games without lists.
        String myFaction = myList != null ? myList.faction() : r.myFaction();
        String opponentFaction = opponentList != null ? opponentList.faction() : r.opponentFaction();
        FriendlyGame g = new FriendlyGame(actor.id(), r.opponentId(), r.myScore(), r.opponentScore(), r.playedOn(),
                r.scenarioCode(), myFaction, opponentFaction, r.leagueId(),
                r.notes() == null || r.notes().isBlank() ? null : r.notes().strip());
        g.setLists(write(myList), write(opponentList));
        games.save(g);
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), "REPORTED", r.myScore() + ":" + r.opponentScore());
        notifications.notify(r.opponentId(), NotificationType.GAME_TO_CONFIRM, Map.of("player", userName(actor.id()),
                "score", r.opponentScore() + ":" + r.myScore()), "/games");
        return g.getId();
    }

    @Transactional
    public void decide(CurrentUser actor, UUID gameId, boolean confirm) {
        FriendlyGame g = pending(gameId);
        // Only the opponent of the reporter decides; the reporter can withdraw instead.
        if (!g.getPlayerB().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        g.decide(confirm);
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), confirm ? "CONFIRMED" : "REJECTED", null);
        notifications.notify(g.getReportedBy(), confirm ? NotificationType.GAME_CONFIRMED : NotificationType.GAME_REJECTED,
                Map.of("player", userName(actor.id()), "score", g.getSmallA() + ":" + g.getSmallB()), "/games");
    }

    @Transactional
    public void withdraw(CurrentUser actor, UUID gameId) {
        FriendlyGame g = pending(gameId);
        if (!g.getReportedBy().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        games.delete(g);
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), "WITHDRAWN", null);
    }

    /** Checks a list against the army lists (characters and upgrades available to the faction); null = no list. */
    GameList validateList(GameList list) {
        if (list == null) {
            return null;
        }
        ArmyContent.ArmyFaction faction = list.faction() == null ? null
                : content.armyFaction(list.faction()).filter(ArmyContent.ArmyFaction::playable).orElse(null);
        if (faction == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FACTION_NOT_FOUND");
        }
        String allied = list.alliedFaction() == null || list.alliedFaction().isBlank() ? null : list.alliedFaction();
        if (allied != null && !faction.optionalAllies().contains(allied)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ALLY");
        }
        List<GameList.Unit> units = list.units() == null ? List.of() : list.units();
        if (units.isEmpty() || units.size() > MAX_LIST_UNITS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WARBAND_SIZE");
        }
        Set<String> allowedUnits = content.unitsFor(faction.code(), allied);
        Set<String> allowedItems = content.itemsFor(faction.code());
        int total = 0;
        int leaders = 0;
        List<GameList.Unit> clean = new java.util.ArrayList<>();
        for (GameList.Unit u : units) {
            if (u == null || u.unit() == null || !allowedUnits.contains(u.unit())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "UNIT_NOT_ALLOWED");
            }
            List<GameList.Item> items = u.items() == null ? List.of() : u.items();
            if (items.size() > MAX_LIST_ITEMS) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TOO_MANY_ITEMS");
            }
            List<GameList.Item> cleanItems = new java.util.ArrayList<>();
            for (GameList.Item i : items) {
                ArmyContent.Item item = i == null || i.item() == null || !allowedItems.contains(i.item()) ? null
                        : content.item(i.item()).orElse(null);
                if (item == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "ITEM_NOT_ALLOWED");
                }
                boolean reduced = i.reduced() && item.reducedPoints() != null;
                total += reduced ? item.reducedPoints() : item.points();
                cleanItems.add(new GameList.Item(item.code(), reduced));
            }
            total += content.unit(u.unit()).map(ArmyContent.Unit::points).orElse(0);
            if (u.leader()) {
                leaders++;
            }
            clean.add(new GameList.Unit(u.unit(), u.leader(), cleanItems));
        }
        if (leaders > 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WARBAND_LEADER_REQUIRED");
        }
        return new GameList(faction.code(), allied, clean, total);
    }

    private String write(GameList list) {
        if (list == null) {
            return null;
        }
        try {
            return mapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    GameList readList(String json) {
        if (json == null) {
            return null;
        }
        try {
            return mapper.readValue(json, GameList.class);
        } catch (JsonProcessingException e) {
            return null;  // unreadable old data is not worth failing the whole page
        }
    }

    private String userName(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse("?");
    }

    private FriendlyGame pending(UUID gameId) {
        FriendlyGame g = games.findById(gameId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND"));
        if (g.getStatus() != FriendlyGameStatus.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "GAME_ALREADY_DECIDED");
        }
        return g;
    }

    private List<GameView> views(List<FriendlyGame> list, CurrentUser viewer) {
        Set<UUID> ids = new HashSet<>();
        Set<UUID> leagueIds = new HashSet<>();
        for (FriendlyGame g : list) {
            ids.add(g.getPlayerA());
            ids.add(g.getPlayerB());
            if (g.getLeagueId() != null) {
                leagueIds.add(g.getLeagueId());
            }
        }
        Map<UUID, String> names = users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
        Map<UUID, String> leagueNames = leagues.findAllById(leagueIds).stream()
                .collect(Collectors.toMap(League::getId, League::getName, (a, b) -> a, HashMap::new));
        return list.stream().map(g -> {
            boolean pending = g.getStatus() == FriendlyGameStatus.PENDING;
            boolean canConfirm = viewer != null && pending && g.getPlayerB().equals(viewer.id());
            boolean canWithdraw = viewer != null && pending && g.getReportedBy().equals(viewer.id());
            return new GameView(g.getId(), new PlayerRef(g.getPlayerA(), names.getOrDefault(g.getPlayerA(), "?")),
                    new PlayerRef(g.getPlayerB(), names.getOrDefault(g.getPlayerB(), "?")), g.getSmallA(), g.getSmallB(),
                    g.getPlayedOn(), g.getScenarioCode(), g.getFactionA(), g.getFactionB(),
                    g.getLeagueId() == null ? null
                            : new LeagueRef(g.getLeagueId(), leagueNames.getOrDefault(g.getLeagueId(), "?")),
                    viewer == null ? null : g.getNotes(), g.getStatus(), g.getReportedBy(), canConfirm, canWithdraw,
                    viewer == null ? null : readList(g.getListA()), viewer == null ? null : readList(g.getListB()));
        }).toList();
    }
}
