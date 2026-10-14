package com.skirmishchronicle.table.geo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The terrain library format, shared with the frontend editor (JSON). An admin uploads a picture of a piece
 * (ruin, house, tree, river bend) with its real size and draws its shapes over it, in inches relative to the
 * picture's centre:
 * <ul>
 *   <li>WALL – a polyline with a thickness (a ruin's walls); every segment becomes a solid rectangle;</li>
 *   <li>OBSTACLE – a solid polygon (rock, house, tree trunk);</li>
 *   <li>AREA – an Environment footprint (forest canopy, river); walkable, {@code height} only for LoS.</li>
 * </ul>
 * A map is a decorative background with natural areas (water, forest) plus placed pieces.
 */
public final class TerrainShapes {

    public enum ShapeType { WALL, OBSTACLE, AREA }

    /** One shape of a library piece. {@code points} are [x, y] pairs in inches around the picture centre. */
    public record Shape(ShapeType type, List<Vec> points, double thickness, double height, Set<Env> envs) {
        public Shape {
            points = List.copyOf(points);
            envs = envs == null ? Set.of() : Set.copyOf(envs);
        }
    }

    /** A library piece (or the shapes of one). */
    public record Asset(String id, double widthIn, double heightIn, List<Shape> shapes) {
        public Asset {
            shapes = List.copyOf(shapes);
        }
    }

    /** Smallest and largest uniform scale of a placed piece. */
    public static final double MIN_SCALE = 0.25, MAX_SCALE = 4;

    /**
     * A piece put on a map: centre position, rotation in degrees (clockwise on screen) and a uniform scale of its
     * footprint (x and y together; 1 = the library size, missing in older maps). Scaling grows the outline and the
     * thickness of walls, never the height.
     */
    public record Placement(String assetId, double x, double y, double rotation, Double scale) {
        public Placement {
            scale = scale == null ? 1.0 : scale;
        }

        public Placement(String assetId, double x, double y, double rotation) {
            this(assetId, x, y, rotation, 1.0);
        }
    }

    /** Natural area drawn on a background picture, in absolute inches. */
    public record Area(List<Vec> points, double height, Set<Env> envs) {
        public Area {
            points = List.copyOf(points);
            envs = envs == null ? Set.of() : Set.copyOf(envs);
        }
    }

    private TerrainShapes() {
    }

    /** Solid rectangles for a wall polyline; ends are extended by half the thickness so corners close. */
    public static List<List<Vec>> wallPolygons(List<Vec> line, double thickness) {
        List<List<Vec>> out = new ArrayList<>();
        double h = thickness / 2;
        for (int i = 0; i + 1 < line.size(); i++) {
            Vec a = line.get(i), b = line.get(i + 1);
            double len = a.dist(b);
            if (len < Geometry.EPS) {
                continue;
            }
            Vec d = b.minus(a).times(1 / len), n = new Vec(-d.y(), d.x()).times(h);
            Vec a2 = a.minus(d.times(h)), b2 = b.plus(d.times(h));
            out.add(List.of(a2.plus(n), b2.plus(n), b2.minus(n), a2.minus(n)));
        }
        return out;
    }

    /** World terrain for the geometry: background areas first, then every placed piece's shapes. */
    public static List<Terrain> build(List<Area> background, List<Placement> placements, Map<String, Asset> assets) {
        List<Terrain> out = new ArrayList<>();
        int i = 0;
        for (Area a : background) {
            out.add(new Terrain("bg" + i++, Terrain.Kind.AREA, a.points(), a.height(), a.envs()));
        }
        int k = 0;
        for (Placement pl : placements) {
            Asset asset = assets.get(pl.assetId());
            if (asset == null) {
                throw new IllegalArgumentException("unknown terrain " + pl.assetId());
            }
            Vec at = new Vec(pl.x(), pl.y());
            double sc = pl.scale();
            int s = 0;
            for (Shape shape : asset.shapes()) {
                String id = "p" + k + "s" + s++;
                List<Vec> world = shape.points().stream().map(p -> p.times(sc).rotate(pl.rotation()).plus(at)).toList();
                switch (shape.type()) {
                    case WALL -> {
                        int w = 0;
                        for (List<Vec> rect : wallPolygons(world, shape.thickness() * sc)) {
                            out.add(new Terrain(id + "w" + w++, Terrain.Kind.OBSTACLE, rect, shape.height(), shape.envs()));
                        }
                    }
                    case OBSTACLE -> out.add(new Terrain(id, Terrain.Kind.OBSTACLE, world, shape.height(), shape.envs()));
                    case AREA -> out.add(new Terrain(id, Terrain.Kind.AREA, world, shape.height(), shape.envs()));
                }
            }
            k++;
        }
        return out;
    }
}
