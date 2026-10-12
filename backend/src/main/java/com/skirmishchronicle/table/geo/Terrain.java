package com.skirmishchronicle.table.geo;

import java.util.List;
import java.util.Set;

/**
 * One piece of world terrain on the plan. OBSTACLE: solid scenery that blocks models shorter than
 * {@code height} and LoS rays below it. AREA: an Environment footprint (forest, water) that models walk on.
 */
public record Terrain(String id, Kind kind, List<Vec> points, double height, Set<Env> envs) {

    public enum Kind { OBSTACLE, AREA }

    public Terrain {
        points = List.copyOf(points);
        envs = Set.copyOf(envs);
    }
}
