package com.skirmishchronicle.table.geo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TerrainShapesTest {

    private static final TerrainShapes.Asset RUIN = new TerrainShapes.Asset("ruin", 6, 6, List.of(
            new TerrainShapes.Shape(TerrainShapes.ShapeType.WALL,
                    List.of(new Vec(-3, -3), new Vec(3, -3), new Vec(3, 3)), 0.5, 3, Set.of()),
            new TerrainShapes.Shape(TerrainShapes.ShapeType.AREA,
                    List.of(new Vec(-3, -3), new Vec(3, -3), new Vec(3, 3), new Vec(-3, 3)), 0, 0, Set.of(Env.DIFFICULT))));

    @Test
    void wallSegmentsBecomeThickRectanglesWithClosedCorners() {
        List<List<Vec>> rects = TerrainShapes.wallPolygons(List.of(new Vec(0, 0), new Vec(4, 0), new Vec(4, 4)), 0.5);
        assertEquals(2, rects.size());
        // the corner point is covered by both rectangles (ends extended by half the thickness)
        assertTrue(Geometry.pointInPolygon(new Vec(4.2, -0.2), rects.get(0)));
        assertTrue(Geometry.pointInPolygon(new Vec(4.2, -0.2), rects.get(1)));
    }

    @Test
    void placedPieceIsRotatedAndMoved() {
        List<Terrain> t = TerrainShapes.build(List.of(), List.of(new TerrainShapes.Placement("ruin", 18, 18, 90)),
                Map.of("ruin", RUIN));
        assertEquals(3, t.size());
        // after a 90° turn the first wall runs along x = 21
        assertTrue(Geometry.pointInPolygon(new Vec(21, 18), t.get(0).points()));
        assertFalse(Geometry.pointInPolygon(new Vec(18, 15), t.get(0).points()));
        assertEquals(Terrain.Kind.AREA, t.get(2).kind());
    }

    @Test
    void backgroundAreasComeFirst() {
        List<Terrain> t = TerrainShapes.build(
                List.of(new TerrainShapes.Area(List.of(new Vec(0, 0), new Vec(36, 0), new Vec(36, 4)), 0, Set.of(Env.AQUATIC_SHALLOW))),
                List.of(), Map.of());
        assertEquals("bg0", t.get(0).id());
        assertTrue(t.get(0).envs().contains(Env.AQUATIC_SHALLOW));
    }
}
