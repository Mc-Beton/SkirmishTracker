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
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
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
                          int yourSide, String role, Instant updatedAt, String mode) {
    }

    /** A model profile for the free game's model list. */
    public record ProfileView(String code, String name, String size, List<String> factions, List<String> classes) {
    }

    public static final String SANDBOX_NAME = "Free game";

    /** What an invited player sees before accepting: who invites, the map, the quest and the rules of the table. */
    public record Invitation(UUID id, String mapName, String questCode, String measureMode, String deployment,
                             TableView.Player from, Instant invitedAt, String mode) {
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
    private final NotificationService notifications;

    public TableService(GameTableRepository tables, TableEventStore events, TableLibraryService library,
                        ArmyListRepository lists, WarbandService warbands, UserRepository users, LiveEventService live,
                        ObjectMapper json, ContentService content, FriendlyGameService friendly,
                        TableWatcherRepository watchers, NotificationService notifications) {
        this.notifications = notifications;
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
        return create(actor, mapId, listId, questCode, measureMode, judge, observers, null);
    }

    /** As above; {@code opponentId} (optional) is invited by name and notified, the link works as well. */
    @Transactional
    public Created create(CurrentUser actor, UUID mapId, UUID listId, String questCode, GameTable.MeasureMode measureMode,
                          boolean judge, boolean observers, UUID opponentId) {
        String quest = questCode == null || questCode.isBlank() ? null : questCode;
        if (quest != null && content.quest(quest).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_QUEST");
        }
        GameState.Deployment deployment = quest == null ? GameState.Deployment.STANDARD
                : content.quest(quest).map(q -> "CORNER".equals(q.deploymentType()) ? GameState.Deployment.CORNER
                        : GameState.Deployment.STANDARD).orElse(GameState.Deployment.STANDARD);
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
                snap.deploymentDepth(), deployment, list.getUnits(), Tokens.sha256(invite), measureMode);
        String judgeInvite = judge ? Tokens.newToken() : null;
        if (judgeInvite != null) {
            t.newJudgeInvite(Tokens.sha256(judgeInvite));
        }
        String watchInvite = observers ? Tokens.newToken() : null;
        t.observers(observers, watchInvite == null ? null : Tokens.sha256(watchInvite));
        tables.saveAndFlush(t); // the event log (plain JDBC) references the row
        appendSystem(t, models(0, list));
        if (opponentId != null) {
            inviteUser(actor, t, opponentId);
        }
        return new Created(t.getId(), invite, judgeInvite, watchInvite);
    }

    /**
     * A free game: no map and no lists – the mat, terrain and models are put on the table during the game. The creator
     * plays both sides until somebody joins (link or invitation by name; the opponent may join without a list).
     */
    @Transactional
    public Created createSandbox(CurrentUser actor, String questCode, GameTable.MeasureMode measureMode, boolean judge,
                                 boolean observers, UUID opponentId) {
        String quest = questCode == null || questCode.isBlank() ? null : questCode;
        if (quest != null && content.quest(quest).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_QUEST");
        }
        users.findByIdForUpdate(actor.id());
        if (tables.countOpen(actor.id()) >= MAX_OPEN_TABLES) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_TOO_MANY_OPEN");
        }
        MapSnapshot snap = new MapSnapshot(SANDBOX_NAME, 36, 36, 8, null, List.of(), Map.of());
        String invite = Tokens.newToken();
        GameTable t = new GameTable(actor.id(), SANDBOX_NAME, null, write(snap), 36, 36, 8, null, null, Tokens.sha256(invite),
                measureMode);
        t.makeSandbox();
        String judgeInvite = judge ? Tokens.newToken() : null;
        if (judgeInvite != null) {
            t.newJudgeInvite(Tokens.sha256(judgeInvite));
        }
        String watchInvite = observers ? Tokens.newToken() : null;
        t.observers(observers, watchInvite == null ? null : Tokens.sha256(watchInvite));
        tables.saveAndFlush(t);
        if (quest != null) {
            appendSystem(t, List.of(new GameEvent.QuestSet(quest)));
        }
        if (opponentId != null) {
            inviteUser(actor, t, opponentId);
        }
        return new Created(t.getId(), invite, judgeInvite, watchInvite);
    }

    /** Model profiles for the free game (riders and creatures; mounts go with a rider from a list). */
    public List<ProfileView> profiles() {
        return engine.profiles().all().stream()
                .map(p -> new ProfileView(p.code(), p.name(), p.size().name(), p.factions(), p.classes()))
                .sorted(java.util.Comparator.comparing(ProfileView::name)).toList();
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

    // ------------------------------------------------------------------ invitation by name

    /** Creator: invite a registered player by name while the seat is free (replaces an earlier invited player). */
    @Transactional
    public TableView.Player inviteUser(CurrentUser actor, UUID id, UUID userId) {
        GameTable t = created(actor, id);
        return inviteUser(actor, t, userId);
    }

    private TableView.Player inviteUser(CurrentUser actor, GameTable t, UUID userId) {
        if (t.getPlayerB() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_INVITE_USED");
        }
        if (userId == null || userId.equals(actor.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_CANNOT_PLAY_YOURSELF");
        }
        User invited = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_PLAYER_NOT_FOUND"));
        if (userId.equals(t.getJudgeId())) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_PLAYER_CANNOT_JUDGE");
        }
        boolean again = userId.equals(t.getInvitedUserId());
        t.inviteUser(userId);
        if (!again) {
            notifications.notify(userId, NotificationType.TABLE_INVITATION,
                    Map.of("player", player(actor.id(), 0).name(), "map", t.getMapName()), "/tables/join?table=" + t.getId());
        }
        live.tableChangedAfterCommit(t.getId(), 0);
        return new TableView.Player(1, invited.getId(), invited.getDisplayName());
    }

    /** Creator: withdraw the invitation by name (the link keeps working). */
    @Transactional
    public void cancelUserInvite(CurrentUser actor, UUID id) {
        GameTable t = created(actor, id);
        t.inviteUser(null);
        live.tableChangedAfterCommit(t.getId(), 0);
    }

    /** Open invitations of the user (seat still free). */
    @Transactional(readOnly = true)
    public List<Invitation> invitations(CurrentUser actor) {
        return tables.findInvitationsOf(actor.id()).stream().map(this::invitation).toList();
    }

    /** One invitation – only for the invited player, while the seat is free. */
    @Transactional(readOnly = true)
    public Invitation invitation(CurrentUser actor, UUID id) {
        return invitation(invited(actor, tables.findById(id)));
    }

    /** The invited player takes the seat with one of their lists. */
    @Transactional
    public UUID acceptInvitation(CurrentUser actor, UUID id, UUID listId) {
        GameTable t = invited(actor, tables.findByIdForUpdate(id));
        seat(actor, t, listId);
        return t.getId();
    }

    /** The invited player says no; the creator can invite somebody else or share the link. */
    @Transactional
    public void declineInvitation(CurrentUser actor, UUID id) {
        GameTable t = invited(actor, tables.findByIdForUpdate(id));
        t.inviteUser(null);
        live.tableChangedAfterCommit(t.getId(), 0);
    }

    private GameTable invited(CurrentUser actor, java.util.Optional<GameTable> found) {
        GameTable t = found.filter(x -> actor.id().equals(x.getInvitedUserId()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_INVITE_INVALID"));
        if (t.getPlayerB() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_INVITE_USED");
        }
        return t;
    }

    /** Player B sits down: with a list (its models join), or – in a free game – without one. */
    private void seat(CurrentUser actor, GameTable t, UUID listId) {
        if (t.getStatus() == GameTable.Status.FINISHED) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_GAME_FINISHED");
        }
        if (listId == null && !t.isSandbox()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_LIST_REQUIRED");
        }
        if (listId == null) {
            t.join(actor.id(), null);
        } else {
            ArmyList list = ownList(actor, listId);
            t.join(actor.id(), list.getUnits());
            if (t.isSandbox()) {
                // models of the list join a free game numbered after the ones already on the table
                List<Recorded> log = events.load(t.getId());
                appendSystem(t, renumber(models(1, list), state(t, log)));
            } else {
                appendSystem(t, models(1, list));
            }
        }
        live.tableChangedAfterCommit(t.getId(), 0);
    }

    /** Model ids of a list for side B of a free game, after the highest id used so far. */
    private static List<GameEvent> renumber(List<GameEvent> evs, GameState s) {
        int n = s.modelCounter[1];
        Map<String, String> ids = new LinkedHashMap<>();
        List<GameEvent> out = new ArrayList<>();
        for (GameEvent e : evs) {
            if (e instanceof GameEvent.ModelAdded m) {
                String id = "b" + (++n);
                ids.put(m.id(), id);
                out.add(new GameEvent.ModelAdded(id, m.side(), m.code(), m.mount()));
            } else if (e instanceof GameEvent.PartyInfo p) {
                out.add(new GameEvent.PartyInfo(p.side(), p.faction(), p.alliedFaction(), p.leaderInt(),
                        p.leaderId() == null ? null : ids.get(p.leaderId())));
            } else {
                out.add(e);
            }
        }
        return out;
    }

    private Invitation invitation(GameTable t) {
        return new Invitation(t.getId(), t.getMapName(), t.getQuestCode(), t.getMeasureMode().name(), t.getDeployment().name(),
                player(t.getPlayerA(), 0), t.getUpdatedAt(), t.getMode().name());
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
        seat(actor, t, listId);
        return t.getId();
    }

    @Transactional(readOnly = true)
    public List<Summary> mine(CurrentUser actor) {
        List<GameTable> all = new ArrayList<>(tables.findMine(actor.id()));
        tables.findAllById(watchers.tableIdsOf(actor.id())).stream().filter(GameTable::isObserversAllowed).forEach(all::add);
        all.sort(java.util.Comparator.comparing(GameTable::getUpdatedAt).reversed());
        return all.stream().map(t -> new Summary(t.getId(), t.getStatus().name(), t.getMapName(),
                player(t.getPlayerA(), 0), t.getPlayerB() == null ? null : player(t.getPlayerB(), 1),
                t.sideOf(actor.id()), role(actor, t).name(), t.getUpdatedAt(), t.getMode().name())).toList();
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
        return command(actor, id, cmd, null);
    }

    /**
     * {@code asSide}: in a free game played alone (no player B yet) the creator acts for side 0 or 1 – the engine
     * still checks turns and AP for that side; undo then works like the judge's (any step).
     */
    @Transactional
    public TableView command(CurrentUser actor, UUID id, Command cmd, Integer asSide) {
        GameTable t = tables.findByIdForUpdate(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
        GameTable.Role role = role(actor, t);
        if (role == GameTable.Role.NONE) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND");
        }
        if (role != GameTable.Role.PLAYER && role != GameTable.Role.JUDGE) {
            throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_READ_ONLY");
        }
        int side = role == GameTable.Role.JUDGE ? TableEngine.JUDGE : t.sideOf(actor.id());
        if (solo(t, role)) {
            if (cmd instanceof Command.Undo) {
                side = TableEngine.JUDGE;
            } else if (asSide != null && (asSide == 0 || asSide == 1)) {
                side = asSide;
            }
        }
        cmd = resolveLibrary(cmd);
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
        if (cmd instanceof Command.Ready && side >= 0 && side <= 1 && needsScheme(s, side)) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_SCHEME_FIRST");
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
        if (t.isSandbox()) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_SANDBOX_NO_REPORT");
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

    /** The creator of a free game with no opponent yet plays both sides. */
    static boolean solo(GameTable t, GameTable.Role role) {
        return role == GameTable.Role.PLAYER && t.isSandbox() && t.getPlayerB() == null;
    }

    /** Free game: the mat and terrain pieces are copied from the library; quest and Scheme codes are checked. */
    private Command resolveLibrary(Command cmd) {
        return switch (cmd) {
            case Command.SetBackground sb -> {
                String bid = sb.background() == null ? null : sb.background().backgroundId();
                TableLibraryService.BackgroundView b = library.backgrounds().stream().filter(x -> x.id().toString().equals(bid))
                        .findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_BACKGROUND_NOT_FOUND"));
                yield new Command.SetBackground(new GameEvent.BackgroundSet(bid, b.imageId().toString(), b.widthIn(), b.heightIn(),
                        b.areas() == null ? List.of() : b.areas()));
            }
            case Command.PlaceTerrain pt -> {
                TableLibraryService.TerrainView a = library.terrain().stream().filter(x -> x.id().toString().equals(pt.assetId()))
                        .findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_UNKNOWN_TERRAIN"));
                yield new Command.PlaceTerrain(pt.assetId(), a.name(), a.imageId().toString(), a.widthIn(), a.heightIn(),
                        a.shapes() == null ? List.of() : a.shapes(), pt.pos(), pt.rotation(), pt.scale());
            }
            case Command.SetQuest q -> {
                if (q.code() != null && content.quest(q.code()).isEmpty()) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_QUEST");
                }
                yield q;
            }
            case Command.PickScheme ps -> {
                if (content.content().schemes().stream().noneMatch(x -> x.code().equals(ps.scheme()))) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_SCHEME");
                }
                yield ps;
            }
            default -> cmd;
        };
    }

    /** A player whose faction has a Scheme table keeps a Scheme before "Ready". */
    private boolean needsScheme(GameState s, int side) {
        GameState.Party party = s.parties[side];
        return party != null && party.leaderInt() >= 1 && content.hasSchemeTable(party.faction())
                && !s.schemeKept.containsKey(side);
    }

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
        if (snap.background() == null) {
            return List.of(); // a free game: the field comes from the events
        }
        Map<String, TerrainShapes.Asset> assets = new LinkedHashMap<>();
        snap.assets().forEach((id, a) -> assets.put(id, new TerrainShapes.Asset(id, a.widthIn(), a.heightIn(), a.shapes())));
        return TerrainShapes.build(snap.background().areas(), snap.placements(), assets);
    }

    private GameState state(GameTable t, List<Recorded> log) {
        return GameState.fold(t.getWidthIn(), t.getHeightIn(), t.getDeploymentDepth(), t.getDeployment(), terrain(snapshot(t)), log,
                engine.profiles(), t.isSandbox());
    }

    private TableView view(CurrentUser actor, GameTable t, List<Recorded> log, GameState s) {
        int you = t.sideOf(actor.id());
        GameTable.Role role = role(actor, t);
        MapSnapshot snap = snapshot(t);
        boolean sandbox = t.isSandbox();
        boolean solo = solo(t, role);
        List<TableView.Placed> placed;
        if (sandbox) {
            placed = s.pieces.values().stream().map(p -> new TableView.Placed(p.assetId(), uuid(p.imageId()),
                    p.widthIn() * p.scale(), p.heightIn() * p.scale(), p.x(), p.y(), p.rotation(), p.id(), p.scale(), p.name())).toList();
        } else {
            List<TableView.Placed> fromMap = new ArrayList<>();
            for (int i = 0; i < snap.placements().size(); i++) {
                TerrainShapes.Placement p = snap.placements().get(i);
                TableLibraryService.TerrainView a = snap.assets().get(p.assetId());
                fromMap.add(new TableView.Placed(p.assetId(), a == null ? null : a.imageId(), a == null ? 0 : a.widthIn() * p.scale(),
                        a == null ? 0 : a.heightIn() * p.scale(), p.x(), p.y(), p.rotation(), "m" + i, p.scale(), a == null ? null : a.name()));
            }
            placed = fromMap;
        }
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
        int undoSide = role == GameTable.Role.JUDGE || solo ? TableEngine.JUDGE : you;
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
            if (p == null && !s.schemeKept.containsKey(side)) {
                continue; // a free game: a side without a list shows only its picked Scheme
            }
            List<TableView.SchemeCard> drawn = s.schemesDrawn.getOrDefault(side, List.of()).stream()
                    .map(c -> new TableView.SchemeCard(c.scheme(), c.roll())).toList();
            parties.add(new TableView.PartyView(side, p == null ? null : p.faction(), p == null ? 0 : p.leaderInt(),
                    p == null ? null : p.leaderId(), drawn, s.schemeKept.get(side)));
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
        String questCode = sandbox ? s.questCode : t.getQuestCode();
        String deployment = !sandbox ? t.getDeployment().name()
                : questCode != null && content.quest(questCode).map(q -> "CORNER".equals(q.deploymentType())).orElse(false)
                ? GameState.Deployment.CORNER.name() : GameState.Deployment.STANDARD.name();
        TableView.Background background = !sandbox
                ? new TableView.Background(snap.background().imageId(), snap.background().widthIn(), snap.background().heightIn())
                : s.background == null ? new TableView.Background(null, s.width, s.height)
                : new TableView.Background(uuid(s.background.imageId()), s.background.widthIn(), s.background.heightIn());
        return new TableView(t.getId(), t.getStatus().name(), snap.name(), questCode,
                new TableView.Field(s.width, s.height, snap.deploymentDepth(), deployment, GameState.CORNER_RADIUS),
                background,
                placed, terrain, players(t),
                you, game, models, parties, tokens, templates, vp, new int[] {s.totalVp(0), s.totalVp(1)}, s.endProposedBy,
                t.getReportedGameId(),
                entries, canUndo, log.isEmpty() ? 0 : log.get(log.size() - 1).seq(), t.getMeasureMode().name(), role.name(),
                t.isObserversAllowed(), t.getJudgeId() == null ? null : player(t.getJudgeId(), TableEngine.JUDGE),
                t.isCreator(actor.id()),
                t.isCreator(actor.id()) && t.getInvitedUserId() != null ? player(t.getInvitedUserId(), 1) : null,
                t.getMode().name(), solo, sandbox && s.background != null ? s.background.backgroundId() : null);
    }

    private static UUID uuid(String s) {
        try {
            return s == null ? null : UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Player A, and player B once they have joined (List.of rejects the missing seat). */
    private List<TableView.Player> players(GameTable t) {
        List<TableView.Player> out = new ArrayList<>(2);
        out.add(player(t.getPlayerA(), 0));
        if (t.getPlayerB() != null) {
            out.add(player(t.getPlayerB(), 1));
        }
        return out;
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
