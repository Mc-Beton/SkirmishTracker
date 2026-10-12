package com.skirmishchronicle.table.geo;

import java.util.List;

/**
 * Result of a movement check: the reachable path (starting at the model), spent movement (slow Environments
 * count double), plain length, why it stopped, the enemy now in base contact and an illegal end on an ally.
 */
public record MovePlan(List<Vec> path, double cost, double length, double budget, Block stoppedBy,
                       String engagedWith, String endsOnAlly) {

    /** kind: BUDGET, TERRAIN, UNSCALABLE, ENEMY, EDGE; ref: terrain or piece id. */
    public record Block(String kind, String ref) {
    }

    public Vec end() {
        return path.get(path.size() - 1);
    }
}
