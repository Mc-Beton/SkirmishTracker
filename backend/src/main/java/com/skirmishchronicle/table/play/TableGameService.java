package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.live.LiveEventService;
import com.skirmishchronicle.table.engine.GameState;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.library.TableLibraryService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Play on a table of the game engine. The browser gets the events and folds them itself with the same engine
 * (frontend/src/lib/eld); commands go through the rules service under the row lock of the table. Who may see
 * and who may act is decided here, as for every table: players act, observers and admins read, strangers get 404.
 */
@Service
public class TableGameService {

    /** What the page needs besides the events: the pictures of the map, who sits where, what the viewer is. */
    public record Meta(UUID id, String status, String mapName, String questCode, String deployment, double deploymentDepth,
                       TableView.Background background, List<TableView.Placed> placements, List<TableView.TerrainView> terrain,
                       List<TableView.Player> players, int you, String role, boolean creator, TableView.Player invited,
                       boolean observersAllowed, UUID reportedGameId, String viewMode, String gameMap,
                       /** Who has confirmed the result after the game (A, B); a tournament table has none to confirm. */
                       List<Boolean> resultOk, boolean matchTable) {
    }

    /** {@code hands}: [yours or null, …] – a player sees only their own Scheme cards (both while playing alone). */
    public record GameView(Meta meta, JsonNode events, JsonNode hands, long seq) {
    }

    private final TableService tables;
    private final GameTableRepository repo;
    private final GameEngine game;
    private final LiveEventService live;
    private final ObjectMapper json;
    private final com.skirmishchronicle.tournament.service.RoundService rounds;

    public TableGameService(TableService tables, GameTableRepository repo, GameEngine game, LiveEventService live,
                            ObjectMapper json, com.skirmishchronicle.tournament.service.RoundService rounds) {
        this.rounds = rounds;
        this.tables = tables;
        this.repo = repo;
        this.game = game;
        this.live = live;
        this.json = json;
    }

    /** Which engine the table plays by – the page picks its panel from this. */
    @Transactional(readOnly = true)
    public String engine(CurrentUser actor, UUID id) {
        return tables.visible(actor, id).getEngine().name();
    }

    /** The table and its events after {@code after} (0: all of them). */
    @Transactional(readOnly = true)
    public GameView view(CurrentUser actor, UUID id, long after) {
        GameTable t = gameTable(tables.visible(actor, id));
        GameTable.Role role = tables.role(actor, t);
        int you = t.sideOf(actor.id());
        TableService.MapSnapshot snap = tables.snapshot(t);
        List<TableView.Placed> placed = new ArrayList<>();
        for (int i = 0; i < snap.placements().size(); i++) {
            TerrainShapes.Placement p = snap.placements().get(i);
            TableLibraryService.TerrainView a = snap.assets().get(p.assetId());
            placed.add(new TableView.Placed(p.assetId(), a == null ? null : a.imageId(), a == null ? 0 : a.widthIn() * p.scale(),
                    a == null ? 0 : a.heightIn() * p.scale(), p.x(), p.y(), p.rotation(), "m" + i, p.scale(), a == null ? null : a.name()));
        }
        List<TableView.TerrainView> terrain = tables.terrain(snap).stream().map(x -> new TableView.TerrainView(x.id(), x.kind().name(),
                x.points(), x.height(), x.envs().stream().map(Enum::name).sorted().toList())).toList();
        boolean corner = t.getDeployment() == GameState.Deployment.CORNER;
        Meta meta = new Meta(t.getId(), t.getStatus().name(), t.getMapName(), t.getQuestCode(), t.getDeployment().name(),
                corner ? GameState.CORNER_RADIUS : snap.deploymentDepth(),
                snap.background() == null ? new TableView.Background(null, snap.widthIn(), snap.heightIn())
                        : new TableView.Background(snap.background().imageId(), snap.background().widthIn(), snap.background().heightIn()),
                placed, terrain, tables.players(t), you, role.name(), t.isCreator(actor.id()),
                t.isCreator(actor.id()) && t.getInvitedUserId() != null ? tables.player(t.getInvitedUserId(), 1) : null,
                t.isObserversAllowed(), t.getReportedGameId(), t.getViewMode(), t.getGameMap(),
                List.of(t.isResultOk(0), t.isResultOk(1)), t.getMatchId() != null);
        // While the second seat is empty the creator moves both sides and sees both; after that every viewer gets
        // the events in the form kept for them (hidden models of others masked).
        TableEventStore.Viewer viewer = you == 0 && t.getPlayerB() == null ? TableEventStore.Viewer.ALL
                : you == 0 ? TableEventStore.Viewer.PLAYER_A : you == 1 ? TableEventStore.Viewer.PLAYER_B
                : TableEventStore.Viewer.OTHER;
        return new GameView(meta, game.eventsAfter(t, Math.max(0, after), viewer), handsFor(t, you), t.lastSeq());
    }

    /** One command of a player; returns the number of the last event. */
    @Transactional
    public long command(CurrentUser actor, UUID id, JsonNode cmd) {
        if (cmd == null || !cmd.isObject() || !cmd.path("type").isTextual() || cmd.path("type").asText().length() > 30
                || cmd.toString().length() > 6000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_COMMAND");
        }
        GameTable t = repo.findByIdForUpdate(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND"));
        GameTable.Role role = tables.role(actor, t);
        if (role == GameTable.Role.NONE) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND");
        }
        gameTable(t);
        if (role != GameTable.Role.PLAYER) {
            throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_READ_ONLY");
        }
        if (t.getReportedGameId() != null) {
            // the result is already in "My games": nothing on the table changes any more
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_ALREADY_REPORTED");
        }
        long seq = game.command(t, t.sideOf(actor.id()), actor.id(), tables.player(actor.id(), 0).name(), cmd);
        // what a player confirmed after the game was the result before this change
        t.resultChanged();
        if (t.getMatchId() != null && !t.isMatchReported()) {
            // a tournament table: when the game is over, its Victory Points are the result of the match
            JsonNode sum = game.summary(t);
            if ("finished".equals(sum.path("phase").asText())) {
                UUID tournament = rounds.resultFromTable(t.getMatchId(), sum.path("vp").path(0).asInt(0), sum.path("vp").path(1).asInt(0));
                t.matchReported();
                if (tournament != null) {
                    live.tournamentChangedAfterCommit(tournament, "changed");
                }
            }
        }
        live.tableChangedAfterCommit(t.getId(), seq);
        return seq;
    }

    private static GameTable gameTable(GameTable t) {
        if (!t.isGame()) {
            throw new ApiException(HttpStatus.CONFLICT, "TABLE_OTHER_ENGINE");
        }
        return t;
    }

    /** A player's own Scheme cards; both hands while the other seat is empty (one player moves both sides). */
    private JsonNode handsFor(GameTable t, int you) {
        JsonNode all = game.hands(t);
        boolean solo = you >= 0 && t.getPlayerB() == null;
        ArrayNode out = json.createArrayNode();
        for (int side = 0; side < 2; side++) {
            if (you == side || solo) {
                out.add(all.get(side));
            } else {
                out.addNull();
            }
        }
        return out;
    }
}
