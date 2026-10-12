package com.skirmishchronicle.table.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.table.geo.Env;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Events are stored as JSON and replayed; library shapes are exchanged with the browser editor as JSON. */
class EventJsonTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void everyEventSurvivesTheRoundTrip() throws Exception {
        List<GameEvent> all = List.of(
                new GameEvent.ModelAdded("a1", 0, "SLAYER_DRAGOON", "LUPUS_REX"), new GameEvent.FirstPlayer(1),
                new GameEvent.Deployed("a1", 3, 33, 270), new GameEvent.Ready(0), new GameEvent.Activated("a1"),
                new GameEvent.Moved("a1", "RUN", List.of(new Vec(3, 33), new Vec(3, 25.5)), 7.5, 270, "b2"),
                new GameEvent.FreeMoved("a1", 4, 20, 90), new GameEvent.Rotated("a1", 45), new GameEvent.Reacted("b1"),
                new GameEvent.Rolled("Attack", "b1", 14, List.of(3, 17, 1)), new GameEvent.HpChanged("a1", -2),
                new GameEvent.StateSet("a1", ModelState.BLEEDING, true), new GameEvent.ApSet("a1", 1),
                new GameEvent.ActivationEnded(), new GameEvent.TurnEnded(), new GameEvent.GameEnded("CONCEDED", 1),
                new GameEvent.Undone(List.of(7L, 8L)), new GameEvent.PartyInfo(0, "HELIAN_LEAGUE", null, 15, "a1"),
                new GameEvent.SchemesDrawn(0, List.of(new GameEvent.SchemeCard("X", 4))), new GameEvent.SchemeKept(0, "X"),
                new GameEvent.TokenPlaced("t1", "CACHE", 3, 4, null), new GameEvent.TokenMoved("t1", 5, 6),
                new GameEvent.TokenRemoved("t1"), new GameEvent.VpSet(1, 2, 3, 1),
                new GameEvent.TemplatePlaced("s1", "SPRAY_L", 1, 2, 90, "a1", "Breath"), new GameEvent.TemplateRemoved("s1"),
                new GameEvent.EndProposed(1));
        for (GameEvent e : all) {
            String s = json.writerFor(GameEvent.class).writeValueAsString(e);
            assertTrue(s.contains("\"type\""), s);
            assertEquals(e, json.readValue(s, GameEvent.class));
        }
    }

    @Test
    void terrainShapesUseTheBrowserFormat() throws Exception {
        String fromEditor = """
                [{"type":"WALL","points":[{"x":-3,"y":-3},{"x":3,"y":-3}],"thickness":0.5,"height":3},
                 {"type":"AREA","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"height":0,"envs":["FOREST"]}]""";
        List<TerrainShapes.Shape> shapes = json.readValue(fromEditor, new TypeReference<>() {
        });
        assertEquals(TerrainShapes.ShapeType.WALL, shapes.get(0).type());
        assertEquals(0.5, shapes.get(0).thickness(), 1e-9);
        assertTrue(shapes.get(0).envs().isEmpty());
        assertTrue(shapes.get(1).envs().contains(Env.FOREST));
        TerrainShapes.Placement p = json.readValue("{\"assetId\":\"x\",\"x\":10,\"y\":12,\"rotation\":45}", TerrainShapes.Placement.class);
        assertEquals(45, p.rotation(), 1e-9);
    }
}
