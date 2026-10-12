package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.armylist.ArmyList;
import com.skirmishchronicle.armylist.ArmyListRepository;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.common.Tokens;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.friendly.FriendlyGameService;
import com.skirmishchronicle.friendly.GameList;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.live.LiveEventService;
import com.skirmishchronicle.table.engine.Command;
import com.skirmishchronicle.table.engine.GameEvent;
import com.skirmishchronicle.table.engine.GameState;
import com.skirmishchronicle.table.engine.Recorded;
import com.skirmishchronicle.table.engine.RuleViolation;
import com.skirmishchronicle.table.engine.TableEngine;
import com.skirmishchronicle.table.geo.Geometry;
import com.skirmishchronicle.table.geo.Terrain;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.library.TableLibraryService;
import com.skirmishchronicle.table.library.TableMap;
import com.skirmishchronicle.table.rules.Profiles;
import com.skirmishchronicle.table.rules.Stat;
import com.skirmishchronicle.tournament.service.WarbandService;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Online games. A table is created from a map and one of the creator's saved lists; the opponent joins with
 * the invitation link and a list of their own. Every command is checked by {@link TableEngine} under a row lock
 * and stored as events; watchers get a live hint and refetch {@link TableView}.
 */
@Service("onlineTableService") // tournament.service.TableService takes the default name
public class TableService {

    public static final int MAX_OPEN_TABLES = 10;
    public static final int LOG_LIMIT = 300;

    public static final int MAX_WATCHERS = 50;

    /** Links handed out once (only their hashes are stored): player, judge (optional), observers (optional). */
    public record Created(UUID id, String invite, String judgeInvite, String watchInvite) {
    }

    public enum InviteKind { PLAYER, JUDGE, WATCH }

    /** What the creator copies from the map into the game. */
    public record MapSnapshot(String name, double widthIn, double heightIn, double deploymentDepth,
                              TableLibraryService.BackgroundView background, List<TerrainShapes.Placement> placements,
                              Map<String, TableLibraryService.TerrainView> assets) {
    }

    public record Summary(UUID id, String status, String mapName, TableView.Player playerA, TableView.Player playerB,
                          int yourSide, String role, Instant updatedAt) {
    }

    private final GameTableRepository tables;
    private final TableEventStore events;
    private final TableLibraryService library;
    private final ArmyListRepository lists;
    private final WarbandService warbands;
    private final UserRepository users;
    private final LiveEventService live;
    private final ObjectMapper json;
    private final ContentService content;
    private final FriendlyGameService friendly;
    private final SecureRandom random = new SecureRandom();
    private final TableEngine engine;
    private final TableWatcherRepository watchers;

    public TableService(GameTableRepository tables, TableEventStore events, TableLibraryService library,
                        ArmyListRepository lists, WarbandService warbands, UserRepository users, LiveEventService live,
                        ObjectMapper json, ContentService content, FriendlyGameService friendly,
                        TableWatcherRepository watchers) {
        this.watchers = watchers;
        this.content = content;
        this.friendly = friendly;
        this.tables = tables;
        this.events = events;
        this.library = library;
        this.lists = lists;
        this.warbands = warbands;
        this.users = users;
        this.live = live;
        this.json = json;
        this.engine = new TableEngine(Profiles.load(), random);
    }

    // ------------------------------------------------------------------ lifecycle

    @Transactional
    public Created create(CurrentUser actor, UUID mapId, UUID listId, String questCode, GameTable.MeasureMode measureMode,
                          boolean judge, boolean observers) {
        String quest = questCode == null || questCode.isBlank() ? null : questCode;
        if (quest != null && content.quest(quest).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_QUEST");
        }
        users.findByIdForUpdate(actor.id());
        if (tables.countOpen(actor.id()) >= MAX_OPEN_TABLES) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_TOO_MANY_OPEN");
        }
        TableMap map = library.visibleMap(actor, mapId);
        TableLibraryService.MapView mv = library.view(actor, map);
        Map<String, TableLibraryService.TerrainView> assets = new LinkedHashMap<>();
        mv.terrain().forEach(t -> assets.put(t.id().toString(), t));
        MapSnapshot snap = new MapSnapshot(mv.name(), mv.background().widthIn(), mv.background().heightIn(),
                mv.deploymentDepth(), mv.background(), mv.placements(), assets);
        ArmyList list = ownList(actor, listId);
        String invite = Tokens.newToken();
        GameTable t = new GameTable(actor.id(), mv.name(), quest, write(snap), snap.widthIn(), snap.heightIn(),
                snap.deploymentDepth(), list.getUnits(), Tokens.sha256(invite), measureMode);
        String judgeInvite = judge ? Tokens.newToken() : null;
        if (judgeInvite != null) {
            t.newJudgeInvite(Tokens.sha256(judgeInvite));
        }
        String watchInvite = observers ? Tokens.newToken() : null;
        t.observers(observers, watchInvite == null ? null : Tokens.sha256(watchInvite));
        tables.saveAndFlush(t); // the event log (plain JDBC) references the row
        appendSystem(t, models(0, list));
        return new Created(t.getId(), invite, judgeInvite, watchInvite);
    }

    /** The judge's seat, taken with the one-time judge link. Players of the table cannot judge it. */
    @Transactional
    public UUID joinAsJudge(CurrentUser actor, String invite) {
        GameTable t = byInvite(invite, InviteKind.JUDGE);
        if (t.getJudgeId() != null || t.getJudgeInviteHash() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_INVITE_USED");
        }
        if (t.sideOf(actor.id()) >= 0) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_PLAYER_CANNOT_JUDGE");
        }
        t.judgeJoined(actor.id());
        watchers.findById(new TableWatcher.Key(t.getId(), actor.id())).ifPresent(watchers::delete);
        live.tableChangedAfterCommit(t.getId(), 0);
        return t.getId();
    }

    /** Observers: anybody logged in with the watch link, while the creator allows observers. Read-only. */
    @Transactional
    public UUID watch(CurrentUser actor, String invite) {
        GameTable t = byInvite(invite, InviteKind.WATCH);
        if (!t.isObserversAllowed()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID");
        }
        if (t.sideOf(actor.id()) >= 0 || t.isJudge(actor.id())) {
            return t.getId(); // already at the table
        }
        TableWatcher.Key key = new TableWatcher.Key(t.getId(), actor.id());
        if (!watchers.existsById(key)) {
            if (watchers.countByTable(t.getId()) >= MAX_WATCHERS) {
                throw new ApiException(HttpStatus.CONFLICT, "TABLE_TOO_MANY_WATCHERS");
            }
            watchers.save(new TableWatcher(t.getId(), actor.id()));
        }
        return t.getId();
    }

    /** A fresh link of the given kind for the creator (the previous one stops working). */
    @Transactional
    public String newInvite(CurrentUser actor, UUID id, InviteKind kind) {
        GameTable t = created(actor, id);
        String token = Tokens.newToken();
        switch (kind) {
            case PLAYER -> {
                if (t.getPlayerB() != null) {
                    throw new ApiException(HttpStatus.CONFLICT, "TABLE_INVITE_USED");
                }
                t.newPlayerInvite(Tokens.sha256(token));
            }
            case JUDGE -> {
                if (t.getJudgeId() != null) {
                    throw new ApiException(HttpStatus.CONFLICT, "TABLE_HAS_JUDGE");
                }
                t.newJudgeInvite(Tokens.sha256(token));
            }
            case WATCH -> {
                if (!t.isObserversAllowed()) {
                    throw new ApiException(HttpStatus.CONFLICT, "TABLE_OBSERVERS_OFF");
                }
                t.observers(true, Tokens.sha256(token));
            }
        }
        return token;
    }

    /** Observers on (returns the new watch link) or off (observers lose access at once). */
    @Transactional
    public String setObservers(CurrentUser actor, UUID id, boolean allowed) {
        GameTable t = created(actor, id);
        String token = allowed ? Tokens.newToken() : null;
        t.observers(allowed, token == null ? null : Tokens.sha256(token));
        if (!allowed) {
            watchers.deleteByTable(t.getId());
        }
        live.tableChangedAfterCommit(t.getId(), 0);
        return token;
    }

    private GameTable created(CurrentUser actor, UUID id) {
        GameTable t = tables.findByIdForUpdate(id).filter(x -> x.sideOf(actor.id()) >= 0)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
        if (!t.isCreator(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_CREATOR_ONLY");
        }
        return t;
    }

    private GameTable byInvite(String invite, InviteKind kind) {
        if (invite == null || invite.isBlank() || invite.length() > 100) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID");
        }
        String hash = Tokens.sha256(invite);
        GameTable found = (kind == InviteKind.JUDGE ? tables.findByJudgeInviteHash(hash) : tables.findByWatchInviteHash(hash))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID"));
        return tables.findByIdForUpdate(found.getId()).orElseThrow();
    }

    /** What the user is at this table. */
    GameTable.Role role(CurrentUser actor, GameTable t) {
        if (t.sideOf(actor.id()) >= 0) {
            return GameTable.Role.PLAYER;
        }
        if (t.isJudge(actor.id())) {
            return GameTable.Role.JUDGE;
        }
        if (t.isObserversAllowed() && watchers.existsById(new TableWatcher.Key(t.getId(), actor.id()))) {
            return GameTable.Role.OBSERVER;
        }
        return actor.admin() ? GameTable.Role.ADMIN : GameTable.Role.NONE;
    }

    @Transactional
    public UUID join(CurrentUser actor, String invite, UUID listId) {
        if (invite == null || invite.length() > 100) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID");
        }
        GameTable found = tables.findByInviteHash(Tokens.sha256(invite))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID"));
        GameTable t = tables.findByIdForUpdate(found.getId()).orElseThrow();
        if (t.getPlayerB() != null || t.getInviteHash() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_INVITE_USED");
        }
        if (t.getPlayerA().equals(actor.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_CANNOT_PLAY_YOURSELF");
        }
        ArmyList list = ownList(actor, listId);
        t.join(actor.id(), list.getUnits());
        appendSystem(t, models(1, list));
        live.tableChangedAfterCommit(t.getId(), 0);
        return t.getId();
    }

    @Transactional(readOnly = true)
    public List<Summary> mine(CurrentUser actor) {
        List<GameTable> all = new ArrayList<>(tables.findMine(actor.id()));
        tables.findAllById(watchers.tableIdsOf(actor.id())).stream().filter(GameTable::isObserversAllowed).forEach(all::add);
        all.sort(java.util.Comparator.comparing(GameTable::getUpdatedAt).reversed());
        return all.stream().map(t -> new Summary(t.getId(), t.getStatus().name(), t.getMapName(),
                player(t.getPlayerA(), 0), t.getPlayerB() == null ? null : player(t.getPlayerB(), 1),
                t.sideOf(actor.id()), role(actor, t).name(), t.getUpdatedAt())).toList();
    }

    // ------------------------------------------------------------------ play

    @Transactional(readOnly = true)
    public TableView view(CurrentUser actor, UUID id) {
        GameTable t = visible(actor, id);
        List<Recorded> log = events.load(t.getId());
        return view(actor, t, log, state(t, log));
    }

    @Transactional
    public TableView command(CurrentUser actor, UUID id, Command cmd) {
        GameTable t = tables.findByIdForUpdate(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
        GameTable.Role role = role(actor, t);
        if (role == GameTable.Role.NONE) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND");
        }
        if (role != GameTable.Role.PLAYER && role != GameTable.Role.JUDGE) {
            throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_READ_ONLY");
        }
        int side = role == GameTable.Role.JUDGE ? TableEngine.JUDGE : t.sideOf(actor.id());
        if (role == GameTable.Role.JUDGE && cmd instanceof Command.DrawSchemes) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_JUDGE_CANNOT");
        }
        if (t.getStatus() == GameTable.Status.WAITING) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_WAITING_FOR_OPPONENT");
        }
        List<Recorded> log = new ArrayList<>(events.load(t.getId()));
        GameState s = state(t, log);
        if (cmd instanceof Command.DrawSchemes) {
            cmd = new Command.DrawSchemes(drawSchemes(s, side));
        }
        List<GameEvent> out;
        try {
            out = engine.decide(s, log, side, cmd);
        } catch (RuleViolation v) {
            throw new ApiException(HttpStatus.CONFLICT, v.code());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_COMMAND");
        }
        long seq = t.takeSeq(out.size());
        Instant now = Instant.now();
        for (GameEvent e : out) {
            Recorded r = new Recorded(seq++, side, actor.id(), now, e);
            events.append(t.getId(), r);
            log.add(r);
        }
        GameState after = state(t, log);
        if (t.getReportedGameId() != null && after.status != GameState.Status.FINISHED) {
            // the result is already in "My games": the end of the game stays
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_ALREADY_REPORTED");
        }
        GameTable.Status status = switch (after.status) {
            case SETUP -> GameTable.Status.SETUP;
            case PLAYING -> GameTable.Status.PLAYING;
            case FINISHED -> GameTable.Status.FINISHED;
        };
        if (status != t.getStatus()) {
            t.setStatus(status);
        }
        live.tableChangedAfterCommit(t.getId(), seq - 1);
        return view(actor, t, log, after);
    }

    /**
     * Reports a finished game as an own game (Victory Points as the small points, both lists attached); the
     * opponent confirms it as usual, then it counts for ELO, leagues and statistics. Once per table.
     */
    @Transactional
    public UUID report(CurrentUser actor, UUID id) {
        GameTable t = tables.findByIdForUpdate(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
        int side = t.sideOf(actor.id());
        if (side < 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND");
        }
        if (t.getReportedGameId() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_ALREADY_REPORTED");
        }
        List<Recorded> log = events.load(t.getId());
        GameState s = state(t, log);
        if (s.status != GameState.Status.FINISHED || !"FINISHED".equals(s.endReason)) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_NOT_FINISHED");
        }
        int other = 1 - side;
        UUID opponent = side == 0 ? t.getPlayerB() : t.getPlayerA();
        GameState.Party mine = s.parties[side], theirs = s.parties[other];
        UUID gameId = friendly.report(actor, new FriendlyGameService.Report(opponent, s.totalVp(side), s.totalVp(other),
                java.time.LocalDate.now(java.time.ZoneId.of("Europe/Warsaw")), t.getQuestCode(),
                mine == null ? null : mine.faction(), theirs == null ? null : theirs.faction(), null,
                "Online: " + t.getMapName(),
                gameList(mine, side == 0 ? t.getListA() : t.getListB()),
                gameList(theirs, side == 0 ? t.getListB() : t.getListA())));
        t.reported(gameId);
        live.tableChangedAfterCommit(t.getId(), 0);
        return gameId;
    }

    private GameList gameList(GameState.Party party, String unitsJson) {
        if (party == null || unitsJson == null) {
            return null;
        }
        List<GameList.Unit> units = warbands.unitViews(party.faction(), party.alliedFaction(), unitsJson).stream()
                .map(u -> new GameList.Unit(u.unit(), u.leader(),
                        u.items().stream().map(i -> new GameList.Item(i.item(), i.reduced())).toList()))
                .toList();
        return new GameList(party.faction(), party.alliedFaction(), units, 0);
    }

    @Transactional(readOnly = true)
    public SseEmitter stream(CurrentUser actor, UUID id, String clientKey) {
        GameTable t = visible(actor, id);
        return live.openTable(actor.id(), t.getId(), clientKey);
    }

    // ------------------------------------------------------------------ helpers

    /** d20 on the faction's Scheme table, as many cards as the Leader's INT allows (shared with tournaments). */
    private List<GameEvent.SchemeCard> drawSchemes(GameState s, int side) {
        GameState.Party party = s.parties[side];
        if (party == null || !content.hasSchemeTable(party.faction())) {
            throw new ApiException(HttpStatus.CONFLICT, "SCHEME_TABLE_MISSING");
        }
        if (party.leaderInt() < 1) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_NO_LEADER");
        }
        if (s.schemesDrawn.containsKey(side)) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_SCHEMES_ALREADY_DRAWN");
        }
        return content.drawSchemes(party.faction(), party.leaderInt(), random).stream()
                .map(c -> new GameEvent.SchemeCard(c.scheme(), c.roll())).toList();
    }

    private GameTable visible(CurrentUser actor, UUID id) {
        return tables.findById(id).filter(t -> role(actor, t) != GameTable.Role.NONE)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
    }

    private ArmyList ownList(CurrentUser actor, UUID listId) {
        return lists.findById(listId == null ? new UUID(0, 0) : listId).filter(l -> l.getUserId().equals(actor.id()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ARMY_LIST_NOT_FOUND"));
    }

    /**
     * Models of a saved list. A mount (e.g. Lupus Rex) is not a separate model: it goes under the first Rider
     * of the list that has no mount yet.
     */
    List<GameEvent> models(int side, ArmyList list) {
        Profiles profiles = engine.profiles();
        List<WarbandService.UnitView> units = warbands.unitViews(list.getFaction(), list.getAlliedFaction(), list.getUnits());
        List<String[]> riders = new ArrayList<>(); // [code, mount]
        List<String> mounts = new ArrayList<>();
        int leaderIndex = -1;
        for (WarbandService.UnitView u : units) {
            if (profiles.mount(u.unit()).isPresent()) {
                mounts.add(u.unit());
            } else if (profiles.profile(u.unit()).isPresent()) {
                if (u.leader()) {
                    leaderIndex = riders.size();
                }
                riders.add(new String[] {u.unit(), null});
            } else {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TABLE_UNKNOWN_PROFILE");
            }
        }
        for (String mount : mounts) {
            riders.stream().filter(r -> r[1] == null && profiles.profile(r[0]).orElseThrow().classes().contains("RIDER"))
                    .findFirst().ifPresent(r -> r[1] = mount);
        }
        if (riders.isEmpty() || riders.size() > 12) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "TABLE_BAD_LIST");
        }
        List<GameEvent> out = new ArrayList<>();
        String prefix = side == 0 ? "a" : "b";
        for (int i = 0; i < riders.size(); i++) {
            out.add(new GameEvent.ModelAdded(prefix + (i + 1), side, riders.get(i)[0], riders.get(i)[1]));
        }
        out.add(new GameEvent.PartyInfo(side, list.getFaction(), list.getAlliedFaction(), list.getLeaderInt(), leaderIndex < 0 ? null : prefix + (leaderIndex + 1)));
        return out;
    }

    private void appendSystem(GameTable t, List<GameEvent> evs) {
        long seq = t.takeSeq(evs.size());
        Instant now = Instant.now();
        for (GameEvent e : evs) {
            events.append(t.getId(), new Recorded(seq++, -1, null, now, e));
        }
    }

    MapSnapshot snapshot(GameTable t) {
        try {
            return json.readValue(t.getMapSnapshot(), MapSnapshot.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("corrupt map snapshot", e);
        }
    }

    List<Terrain> terrain(MapSnapshot snap) {
        Map<String, TerrainShapes.Asset> assets = new LinkedHashMap<>();
        snap.assets().forEach((id, a) -> assets.put(id, new TerrainShapes.Asset(id, a.widthIn(), a.heightIn(), a.shapes())));
        return TerrainShapes.build(snap.background().areas(), snap.placements(), assets);
    }

    private GameState state(GameTable t, List<Recorded> log) {
        return GameState.fold(t.getWidthIn(), t.getHeightIn(), t.getDeploymentDepth(), terrain(snapshot(t)), log, engine.profiles());
    }

    private TableView view(CurrentUser actor, GameTable t, List<Recorded> log, GameState s) {
        int you = t.sideOf(actor.id());
        GameTable.Role role = role(actor, t);
        MapSnapshot snap = snapshot(t);
        List<TableView.Placed> placed = snap.placements().stream().map(p -> {
            TableLibraryService.TerrainView a = snap.assets().get(p.assetId());
            return new TableView.Placed(p.assetId(), a == null ? null : a.imageId(), a == null ? 0 : a.widthIn(),
                    a == null ? 0 : a.heightIn(), p.x(), p.y(), p.rotation());
        }).toList();
        List<TableView.ModelView> models = s.models.values().stream().map(m -> {
            Map<Stat, Integer> eff = s.stats(m);
            return new TableView.ModelView(m.id, m.side, m.profile.code(), m.profile.name(), m.size().name(),
                    m.size().baseMm, m.size().heightMm, m.mount == null ? null : m.mount.code(), m.deployed,
                    m.pos == null ? null : m.pos.x(), m.pos == null ? null : m.pos.y(), m.facing, m.hp, eff.get(Stat.HP),
                    m.ap, m.states.stream().map(Enum::name).toList(), m.profile.stats(), eff, List.copyOf(m.keywords()),
                    m.profile.classes(), m.profile.factions().isEmpty() ? null : m.profile.factions().get(0));
        }).toList();
        TableView.ActivationView act = null;
        if (s.activation != null) {
            var piece = s.table().pieces().stream().filter(p -> p.id().equals(s.activation.id())).findFirst().orElse(null);
            act = new TableView.ActivationView(s.activation.id(), s.activation.mode() == null ? null : s.activation.mode().name(),
                    s.activation.spent(),
                    piece == null ? 0 : Geometry.moveBudget(piece, Geometry.MoveMode.WALK),
                    piece == null ? 0 : Geometry.moveBudget(piece, Geometry.MoveMode.RUN));
        }
        TableView.Game game = new TableView.Game(s.status.name(), s.round, s.active, s.turnInRound, s.firstPlayer,
                new boolean[] {s.ready[0], s.ready[1]}, act, s.winner, s.endReason);
        java.util.Set<Long> undone = GameState.undoneSeqs(log);
        List<Recorded> tail = log.size() > LOG_LIMIT ? log.subList(log.size() - LOG_LIMIT, log.size()) : log;
        List<TableView.LogEntry> entries = tail.stream().map(r -> new TableView.LogEntry(r.seq(), r.side(),
                TableEventStore.typeName(r.event()), json.valueToTree(r.event()), r.at(), undone.contains(r.seq()))).toList();
        boolean canUndo = false;
        int undoSide = role == GameTable.Role.JUDGE ? TableEngine.JUDGE : you;
        if (undoSide >= 0 && (s.status != GameState.Status.FINISHED || role == GameTable.Role.JUDGE)) {
            try {
                engine.decide(s, log, undoSide, new Command.Undo());
                canUndo = true;
            } catch (RuleViolation ignored) {
                // nothing the caller may take back
            }
        }
        List<TableView.TerrainView> terrain = s.terrain.stream().map(x -> new TableView.TerrainView(x.id(), x.kind().name(),
                x.points(), x.height(), x.envs().stream().map(Enum::name).sorted().toList())).toList();
        List<TableView.PartyView> parties = new ArrayList<>();
        for (int side = 0; side < 2; side++) {
            GameState.Party p = s.parties[side];
            if (p == null) {
                continue;
            }
            List<TableView.SchemeCard> drawn = s.schemesDrawn.getOrDefault(side, List.of()).stream()
                    .map(c -> new TableView.SchemeCard(c.scheme(), c.roll())).toList();
            parties.add(new TableView.PartyView(side, p.faction(), p.leaderInt(), p.leaderId(), drawn, s.schemeKept.get(side)));
        }
        List<TableView.VpRow> vp = new ArrayList<>();
        for (int side = 0; side < 2; side++) {
            for (int round = 1; round <= Math.min(Math.max(s.round, 1), GameState.MAX_ROUNDS); round++) {
                vp.add(new TableView.VpRow(side, round, s.vp[side][round][0], s.vp[side][round][1]));
            }
        }
        List<TableView.Token> tokens = s.tokens.values().stream()
                .map(x -> new TableView.Token(x.id(), x.kind(), x.pos().x(), x.pos().y(), x.label())).toList();
        List<TableView.Template> templates = s.templates.values().stream()
                .map(x -> new TableView.Template(x.id(), x.kind(), x.pos().x(), x.pos().y(), x.rotation(), x.modelId(), x.label(), x.side()))
                .toList();
        return new TableView(t.getId(), t.getStatus().name(), snap.name(), t.getQuestCode(),
                new TableView.Field(snap.widthIn(), snap.heightIn(), snap.deploymentDepth()),
                new TableView.Background(snap.background().imageId(), snap.background().widthIn(), snap.background().heightIn()),
                placed, terrain, List.of(player(t.getPlayerA(), 0), t.getPlayerB() == null ? null : player(t.getPlayerB(), 1))
                        .stream().filter(java.util.Objects::nonNull).toList(),
                you, game, models, parties, tokens, templates, vp, new int[] {s.totalVp(0), s.totalVp(1)}, s.endProposedBy,
                t.getReportedGameId(),
                entries, canUndo, log.isEmpty() ? 0 : log.get(log.size() - 1).seq(), t.getMeasureMode().name(), role.name(),
                t.isObserversAllowed(), t.getJudgeId() == null ? null : player(t.getJudgeId(), TableEngine.JUDGE),
                t.isCreator(actor.id()));
    }

    private TableView.Player player(UUID id, int side) {
        User u = users.findById(id).orElse(null);
        return new TableView.Player(side, id, u == null ? "?" : u.getDisplayName());
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
