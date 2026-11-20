package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.skirmishchronicle.table.geo.Terrain;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Tables that play by the game engine (GameTable.Engine.GAME). The rules service decides; this class keeps what it
 * decided: events go to {@code table_events} exactly as they came (the browser folds them with the same engine),
 * the Scheme cards and a short summary go to the table row. Callers hold the row lock of the table.
 */
@Component
public class GameEngine {

    private final RulesClient rules;
    private final TableEventStore events;
    private final ObjectMapper json;

    public GameEngine(RulesClient rules, TableEventStore events, ObjectMapper json) {
        this.rules = rules;
        this.events = events;
        this.json = json;
    }

    /** The field from the map, the creator's party on its shelf, the creator in the first seat. */
    public void start(GameTable t, UUID author, String by, ObjectNode party, List<Terrain> terrain, boolean corner,
                      double deployDepth) {
        start(t, author, by, party, terrain, corner, deployDepth, null, null);
    }

    /** As above; with {@code gameMap} (a 3D table) the field is that map of the game and {@code terrain} is not used. */
    public void start(GameTable t, UUID author, String by, ObjectNode party, List<Terrain> terrain, boolean corner,
                      double deployDepth, String gameMap, JsonNode customMap) {
        ObjectNode req = json.createObjectNode();
        req.put("tableId", t.getId().toString());
        req.put("name", t.getMapName());
        req.put("width", t.getWidthIn());
        req.put("height", t.getHeightIn());
        req.put("deployDepth", deployDepth);
        req.put("deploy", corner ? "corner" : "standard");
        ArrayNode shapes = req.putArray("terrain");
        for (Terrain x : terrain) {
            ObjectNode s = shapes.addObject();
            s.put("id", x.id());
            s.put("kind", x.kind().name());
            s.put("height", x.height());
            ArrayNode pts = s.putArray("points");
            x.points().forEach(p -> pts.addObject().put("x", p.x()).put("y", p.y()));
            ArrayNode envs = s.putArray("envs");
            x.envs().forEach(e -> envs.add(e.name()));
        }
        if (t.getQuestCode() != null) {
            req.put("quest", t.getQuestCode());
        }
        req.put("by", by);
        req.set("party", party);
        if (gameMap != null) {
            req.put("gameMap", gameMap);
        }
        if (customMap != null) {
            // a map from the admin's creator: the rules service gets the map itself and checks it again
            req.set("customMap", customMap);
        }
        JsonNode res = rules.post("/create", req);
        if (gameMap != null && res.path("map").isTextual()) {
            t.mapNamed(text(res.path("map").asText(), 80));
        }
        store(t, res, author);
    }

    /** The second player sits down; {@code party} may be null once the game is under way. */
    public void join(GameTable t, UUID author, String by, ObjectNode party) {
        ObjectNode req = base(t);
        req.put("by", by);
        if (party != null) {
            req.set("party", party);
        }
        store(t, call("/join", req, t), author);
    }

    /** One command of a player (side 0 or 1). Returns the number of the last event. */
    public long command(GameTable t, int side, UUID author, String by, JsonNode cmd) {
        ObjectNode req = base(t);
        req.set("cmd", cmd);
        req.put("side", side);
        req.put("by", by);
        req.set("hands", hands(t));
        store(t, call("/command", req, t), author);
        return t.lastSeq();
    }

    /** Events after {@code afterSeq}, as stored (for the rules service). */
    public ArrayNode eventsAfter(GameTable t, long afterSeq) {
        return eventsAfter(t, afterSeq, TableEventStore.Viewer.ALL);
    }

    /** Events after {@code afterSeq} as this viewer may see them: Shrouded models of others are plain tokens. */
    public ArrayNode eventsAfter(GameTable t, long afterSeq, TableEventStore.Viewer viewer) {
        ArrayNode out = json.createArrayNode();
        for (String payload : events.payloads(t.getId(), afterSeq, viewer)) {
            out.add(read(payload));
        }
        return out;
    }

    /** [hand of side 0, hand of side 1]; a hand is {options, kept} or null. */
    public JsonNode hands(GameTable t) {
        JsonNode stored = t.getSchemeHands() == null ? null : read(t.getSchemeHands());
        if (stored != null && stored.isArray() && stored.size() == 2) {
            return stored;
        }
        ArrayNode empty = json.createArrayNode();
        empty.addNull();
        empty.addNull();
        return empty;
    }

    /** {phase, round, active, vp: [a, b], winner, factions, seq} after the last command; an empty object before. */
    public JsonNode summary(GameTable t) {
        return t.getGameSummary() == null ? json.createObjectNode() : read(t.getGameSummary());
    }

    private ObjectNode base(GameTable t) {
        ObjectNode req = json.createObjectNode();
        req.put("tableId", t.getId().toString());
        req.put("seq", t.lastSeq());
        return req;
    }

    /** The service keeps recent tables in memory; when it does not have this one, the whole log goes with the request. */
    private JsonNode call(String path, ObjectNode req, GameTable t) {
        try {
            return rules.post(path, req);
        } catch (RulesClient.NeedLog e) {
            req.set("log", eventsAfter(t, 0));
            try {
                return rules.post(path, req);
            } catch (RulesClient.NeedLog again) {
                throw new IllegalStateException("rules service asks for the log it was just given, table " + t.getId());
            }
        }
    }

    private void store(GameTable t, JsonNode res, UUID author) {
        JsonNode evs = res.path("events");
        JsonNode views = res.path("views");
        long seq = t.takeSeq(evs.size());
        Instant now = Instant.now();
        int at = 0;
        for (JsonNode ev : evs) {
            JsonNode view = views.path(at++);
            if (ev.path("seq").asLong(-1) != seq) {
                // the service and the stored log disagree: refuse (the transaction rolls back, the next call resends the log)
                throw new IllegalStateException("rules service numbered an event " + ev.path("seq") + ", expected " + seq);
            }
            int side = ev.path("side").isInt() ? ev.path("side").asInt() : -1;
            events.appendRaw(t.getId(), seq, side, side < 0 ? null : author, text(ev.path("type").asText("?"), 30), ev.toString(),
                    form(view, "a"), form(view, "b"), form(view, "o"), now);
            seq++;
        }
        JsonNode summary = res.path("summary");
        t.gameAdvanced(res.has("hands") ? res.get("hands").toString() : null, summary.toString());
        GameTable.Status status = switch (summary.path("phase").asText("setup")) {
            case "finished" -> GameTable.Status.FINISHED;
            case "playing" -> GameTable.Status.PLAYING;
            default -> t.getPlayerB() == null ? GameTable.Status.WAITING : GameTable.Status.SETUP;
        };
        if (status != t.getStatus()) {
            t.setStatus(status);
        }
    }

    /** The form of an event for one kind of viewer, or null when they get the event itself. */
    private static String form(JsonNode view, String who) {
        JsonNode v = view.path(who);
        return v.isObject() ? v.toString() : null;
    }

    private static String text(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private JsonNode read(String s) {
        try {
            return json.readTree(s);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("corrupt game data", e);
        }
    }
}
