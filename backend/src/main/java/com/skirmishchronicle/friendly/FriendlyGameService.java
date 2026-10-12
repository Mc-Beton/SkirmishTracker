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

/**
 * Own games: one player reports, the opponent confirms (only then the game counts for ELO and the league).
 * A game can also be played in the app: started first, points entered turn by turn by either player (like a
 * tournament game), then finished – the totals are reported and the other player confirms.
 */
@Service
public class FriendlyGameService {

    public static final int MAX_PENDING = 20;
    /** Games being played in the app at once, per player. */
    public static final int MAX_LIVE = 5;
    private static final int MAX_TURN_VP = 100;
    private static final String AUDIT_TYPE = "FRIENDLY_GAME";

    public record Report(UUID opponentId, int myScore, int opponentScore, LocalDate playedOn, String scenarioCode,
                         String myFaction, String opponentFaction, UUID leagueId, String notes,
                         GameList myList, GameList opponentList) {
    }

    public static final int MAX_LIST_UNITS = 20;
    public static final int MAX_LIST_ITEMS = 10;

    /** Starting a game played in the app: like a report, without the score. */
    public record Start(UUID opponentId, LocalDate playedOn, String scenarioCode, String myFaction,
                        String opponentFaction, UUID leagueId, String notes, GameList myList, GameList opponentList) {
    }

    public record TurnView(int turn, int scenarioVp, int schemeVp) {
    }

    public record LivePlayer(UUID userId, String displayName, String faction, GameList list, List<TurnView> turns,
                             int totalScenario, int totalScheme, int total, boolean canEdit) {
    }

    /** One own game for its players: header, lists and the points of every turn. */
    public record LiveView(UUID id, FriendlyGameStatus status, LocalDate playedOn, String scenario, LeagueRef league,
                           String notes, int turns, List<LivePlayer> players, UUID reportedBy, int smallA, int smallB,
                           boolean canFinish, boolean canReopen, boolean canCancel, boolean canConfirm,
                           boolean canWithdraw) {
    }

    public record PlayerRef(UUID id, String displayName) {
    }

    public record LeagueRef(UUID id, String name) {
    }

    public record GameView(UUID id, PlayerRef playerA, PlayerRef playerB, int smallA, int smallB, LocalDate playedOn,
                           String scenario, String factionA, String factionB, LeagueRef league, String notes,
                           FriendlyGameStatus status, UUID reportedBy, boolean canConfirm, boolean canWithdraw,
                           GameList listA, GameList listB, boolean canPlay) {
    }

    private final NotificationService notifications;
    private final FriendlyGameRepository games;
    private final UserRepository users;
    private final LeagueRepository leagues;
    private final LeagueMemberRepository members;
    private final ContentService content;
    private final AuditService audit;
    private final ObjectMapper mapper;
    private final FriendlyTurnScoreRepository turnScores;
    private final com.skirmishchronicle.live.LiveEventService live;

    public FriendlyGameService(FriendlyGameRepository games, UserRepository users, LeagueRepository leagues,
                               LeagueMemberRepository members, ContentService content, AuditService audit,
                               ObjectMapper mapper,
            NotificationService notifications, FriendlyTurnScoreRepository turnScores,
            com.skirmishchronicle.live.LiveEventService live) {
        this.turnScores = turnScores;
        this.live = live;
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
        if (r.myScore() < 0 || r.opponentScore() < 0 || r.myScore() > 1000 || r.opponentScore() > 1000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE");
        }
        checkGame(actor, r.opponentId(), r.playedOn(), r.scenarioCode(), r.myFaction(), r.opponentFaction(),
                r.leagueId());
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

    /** Starts a game played in the app; the opponent is told and can enter points on their phone too. */
    @Transactional
    public UUID start(CurrentUser actor, Start r) {
        checkGame(actor, r.opponentId(), r.playedOn(), r.scenarioCode(), r.myFaction(), r.opponentFaction(),
                r.leagueId());
        if (games.countForPlayer(actor.id(), FriendlyGameStatus.IN_PROGRESS) >= MAX_LIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_LIVE_GAMES");
        }
        GameList myList = validateList(r.myList());
        GameList opponentList = validateList(r.opponentList());
        String myFaction = myList != null ? myList.faction() : r.myFaction();
        String opponentFaction = opponentList != null ? opponentList.faction() : r.opponentFaction();
        FriendlyGame g = FriendlyGame.live(actor.id(), r.opponentId(), r.playedOn(), r.scenarioCode(), myFaction,
                opponentFaction, r.leagueId(), r.notes() == null || r.notes().isBlank() ? null : r.notes().strip());
        g.setLists(write(myList), write(opponentList));
        games.save(g);
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), "STARTED", null);
        notifications.notify(r.opponentId(), NotificationType.GAME_STARTED, Map.of("player", userName(actor.id())),
                "/games/" + g.getId());
        return g.getId();
    }

    @Transactional(readOnly = true)
    public LiveView detail(CurrentUser actor, UUID gameId) {
        FriendlyGame g = games.findById(gameId).filter(x -> x.involves(actor.id()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND"));
        List<FriendlyTurnScore> all = turnScores.findByGameId(gameId);
        boolean live = g.getStatus() == FriendlyGameStatus.IN_PROGRESS;
        boolean pending = g.getStatus() == FriendlyGameStatus.PENDING;
        List<LivePlayer> players = new java.util.ArrayList<>();
        for (UUID p : List.of(g.getPlayerA(), g.getPlayerB())) {
            List<TurnView> tv = new java.util.ArrayList<>();
            int sc = 0;
            int sh = 0;
            for (int turn = 1; turn <= content.turns(); turn++) {
                final int tn = turn;
                FriendlyTurnScore s = all.stream().filter(x -> x.getUserId().equals(p) && x.getTurn() == tn)
                        .findFirst().orElse(null);
                int a = s == null ? 0 : s.getScenarioVp();
                int b = s == null ? 0 : s.getSchemeVp();
                sc += a;
                sh += b;
                tv.add(new TurnView(turn, a, b));
            }
            boolean isA = p.equals(g.getPlayerA());
            players.add(new LivePlayer(p, userName(p), isA ? g.getFactionA() : g.getFactionB(),
                    readList(isA ? g.getListA() : g.getListB()), tv, sc, sh, sc + sh, live));
        }
        League league = g.getLeagueId() == null ? null : leagues.findById(g.getLeagueId()).orElse(null);
        boolean reporter = g.getReportedBy().equals(actor.id());
        return new LiveView(g.getId(), g.getStatus(), g.getPlayedOn(), g.getScenarioCode(),
                league == null ? null : new LeagueRef(league.getId(), league.getName()), g.getNotes(), content.turns(),
                players, g.getReportedBy(), g.getSmallA(), g.getSmallB(), live, pending && !all.isEmpty(), live,
                pending && !reporter, pending && reporter);
    }

    /** Either player enters (or corrects) a turn of either side while the game is played. */
    @Transactional
    public void saveTurn(CurrentUser actor, UUID gameId, UUID playerId, int turn, int scenarioVp, int schemeVp) {
        FriendlyGame g = liveGame(actor, gameId);
        if (!g.involves(playerId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PLAYER_NOT_IN_MATCH");
        }
        if (turn < 1 || turn > content.turns()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TURN");
        }
        if (scenarioVp < 0 || schemeVp < 0 || scenarioVp > MAX_TURN_VP || schemeVp > MAX_TURN_VP) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE");
        }
        FriendlyTurnScore s = turnScores.findByGameIdAndUserIdAndTurn(gameId, playerId, turn)
                .orElseGet(() -> new FriendlyTurnScore(gameId, playerId, turn));
        s.set(scenarioVp, schemeVp, actor.id());
        turnScores.save(s);
        live.notificationsChangedAfterCommit(g.opponentOf(actor.id()));
    }

    /** Ends the game: the turn totals are reported, the other player confirms (as with a reported game). */
    @Transactional
    public void finish(CurrentUser actor, UUID gameId) {
        FriendlyGame g = liveGame(actor, gameId);
        List<FriendlyTurnScore> all = turnScores.findByGameId(gameId);
        int a = total(all, g.getPlayerA());
        int b = total(all, g.getPlayerB());
        g.finish(actor.id(), a, b);
        UUID other = g.opponentOf(actor.id());
        boolean mineA = g.getPlayerA().equals(actor.id());
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), "FINISHED", a + ":" + b);
        notifications.notify(other, NotificationType.GAME_TO_CONFIRM, Map.of("player", userName(actor.id()),
                "score", mineA ? b + ":" + a : a + ":" + b), "/games/" + g.getId());
    }

    /** A finished game goes back to the table (either player, before it is confirmed). */
    @Transactional
    public void reopen(CurrentUser actor, UUID gameId) {
        FriendlyGame g = pending(gameId);
        if (!g.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (turnScores.findByGameId(gameId).isEmpty()) {
            // A game reported with the final score has no turns to go back to.
            throw new ApiException(HttpStatus.CONFLICT, "GAME_NOT_PLAYED_IN_APP");
        }
        g.reopen();
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), "REOPENED", null);
        live.notificationsChangedAfterCommit(g.opponentOf(actor.id()));
    }

    private FriendlyGame liveGame(CurrentUser actor, UUID gameId) {
        FriendlyGame g = games.findById(gameId).filter(x -> x.involves(actor.id()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND"));
        if (g.getStatus() != FriendlyGameStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "GAME_NOT_IN_PROGRESS");
        }
        return g;
    }

    private static int total(List<FriendlyTurnScore> all, UUID player) {
        return all.stream().filter(s -> s.getUserId().equals(player))
                .mapToInt(s -> s.getScenarioVp() + s.getSchemeVp()).sum();
    }

    /** Rules shared by reported and started games: opponent, date, scenario, factions, league membership. */
    private void checkGame(CurrentUser actor, UUID opponentId, LocalDate playedOn, String scenarioCode,
                           String myFaction, String opponentFaction, UUID leagueId) {
        Report r = new Report(opponentId, 0, 0, playedOn, scenarioCode, myFaction, opponentFaction, leagueId, null,
                null, null);
        if (r.opponentId().equals(actor.id())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_PLAY_SELF");
        }
        if (!users.existsById(r.opponentId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND");
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
    }

    @Transactional
    public void decide(CurrentUser actor, UUID gameId, boolean confirm) {
        FriendlyGame g = pending(gameId);
        // Only the opponent of the reporter decides; the reporter can withdraw instead.
        if (!g.involves(actor.id()) || g.getReportedBy().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        g.decide(confirm);
        audit.record(actor.id(), AUDIT_TYPE, g.getId(), confirm ? "CONFIRMED" : "REJECTED", null);
        notifications.notify(g.getReportedBy(), confirm ? NotificationType.GAME_CONFIRMED : NotificationType.GAME_REJECTED,
                Map.of("player", userName(actor.id()), "score", g.getReportedBy().equals(g.getPlayerA())
                        ? g.getSmallA() + ":" + g.getSmallB() : g.getSmallB() + ":" + g.getSmallA()), "/games");
    }

    @Transactional
    public void withdraw(CurrentUser actor, UUID gameId) {
        FriendlyGame live = games.findById(gameId).orElse(null);
        if (live != null && live.getStatus() == FriendlyGameStatus.IN_PROGRESS) {
            // A game still being played can be abandoned by either player (it never counted).
            if (!live.involves(actor.id())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
            }
            games.delete(live);
            audit.record(actor.id(), AUDIT_TYPE, live.getId(), "ABANDONED", null);
            this.live.notificationsChangedAfterCommit(live.opponentOf(actor.id()));
            return;
        }
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
            boolean canConfirm = viewer != null && pending && g.involves(viewer.id())
                    && !g.getReportedBy().equals(viewer.id());
            boolean canPlay = viewer != null && g.getStatus() == FriendlyGameStatus.IN_PROGRESS
                    && g.involves(viewer.id());
            boolean canWithdraw = viewer != null && pending && g.getReportedBy().equals(viewer.id());
            return new GameView(g.getId(), new PlayerRef(g.getPlayerA(), names.getOrDefault(g.getPlayerA(), "?")),
                    new PlayerRef(g.getPlayerB(), names.getOrDefault(g.getPlayerB(), "?")), g.getSmallA(), g.getSmallB(),
                    g.getPlayedOn(), g.getScenarioCode(), g.getFactionA(), g.getFactionB(),
                    g.getLeagueId() == null ? null
                            : new LeagueRef(g.getLeagueId(), leagueNames.getOrDefault(g.getLeagueId(), "?")),
                    viewer == null ? null : g.getNotes(), g.getStatus(), g.getReportedBy(), canConfirm, canWithdraw,
                    viewer == null ? null : readList(g.getListA()), viewer == null ? null : readList(g.getListB()),
                    canPlay);
        }).toList();
    }
}
