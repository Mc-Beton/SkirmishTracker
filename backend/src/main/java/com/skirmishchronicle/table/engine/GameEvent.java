package com.skirmishchronicle.table.engine;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import java.util.List;

/**
 * What happened at the table. The game state is the fold of all events that were not undone, so events carry
 * results (the path actually walked, the dice actually rolled), never requests: replaying them never depends
 * on the geometry code or a random generator.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = GameEvent.ModelAdded.class, name = "MODEL_ADDED"),
        @JsonSubTypes.Type(value = GameEvent.FirstPlayer.class, name = "FIRST_PLAYER"),
        @JsonSubTypes.Type(value = GameEvent.Deployed.class, name = "DEPLOYED"),
        @JsonSubTypes.Type(value = GameEvent.Ready.class, name = "READY"),
        @JsonSubTypes.Type(value = GameEvent.Activated.class, name = "ACTIVATED"),
        @JsonSubTypes.Type(value = GameEvent.Moved.class, name = "MOVED"),
        @JsonSubTypes.Type(value = GameEvent.FreeMoved.class, name = "FREE_MOVED"),
        @JsonSubTypes.Type(value = GameEvent.Rotated.class, name = "ROTATED"),
        @JsonSubTypes.Type(value = GameEvent.Reacted.class, name = "REACTED"),
        @JsonSubTypes.Type(value = GameEvent.Rolled.class, name = "ROLLED"),
        @JsonSubTypes.Type(value = GameEvent.HpChanged.class, name = "HP_CHANGED"),
        @JsonSubTypes.Type(value = GameEvent.StateSet.class, name = "STATE_SET"),
        @JsonSubTypes.Type(value = GameEvent.ApSet.class, name = "AP_SET"),
        @JsonSubTypes.Type(value = GameEvent.ActivationEnded.class, name = "ACTIVATION_ENDED"),
        @JsonSubTypes.Type(value = GameEvent.TurnEnded.class, name = "TURN_ENDED"),
        @JsonSubTypes.Type(value = GameEvent.GameEnded.class, name = "GAME_ENDED"),
        @JsonSubTypes.Type(value = GameEvent.Undone.class, name = "UNDONE"),
        @JsonSubTypes.Type(value = GameEvent.PartyInfo.class, name = "PARTY_INFO"),
        @JsonSubTypes.Type(value = GameEvent.SchemesDrawn.class, name = "SCHEMES_DRAWN"),
        @JsonSubTypes.Type(value = GameEvent.SchemeKept.class, name = "SCHEME_KEPT"),
        @JsonSubTypes.Type(value = GameEvent.TokenPlaced.class, name = "TOKEN_PLACED"),
        @JsonSubTypes.Type(value = GameEvent.TokenMoved.class, name = "TOKEN_MOVED"),
        @JsonSubTypes.Type(value = GameEvent.TokenRemoved.class, name = "TOKEN_REMOVED"),
        @JsonSubTypes.Type(value = GameEvent.VpSet.class, name = "VP_SET"),
        @JsonSubTypes.Type(value = GameEvent.TemplatePlaced.class, name = "TEMPLATE_PLACED"),
        @JsonSubTypes.Type(value = GameEvent.TemplateRemoved.class, name = "TEMPLATE_REMOVED"),
        @JsonSubTypes.Type(value = GameEvent.EndProposed.class, name = "END_PROPOSED"),
        @JsonSubTypes.Type(value = GameEvent.ModelRemoved.class, name = "MODEL_REMOVED"),
        @JsonSubTypes.Type(value = GameEvent.BackgroundSet.class, name = "BACKGROUND_SET"),
        @JsonSubTypes.Type(value = GameEvent.TerrainPlaced.class, name = "TERRAIN_PLACED"),
        @JsonSubTypes.Type(value = GameEvent.TerrainMoved.class, name = "TERRAIN_MOVED"),
        @JsonSubTypes.Type(value = GameEvent.TerrainRemoved.class, name = "TERRAIN_REMOVED"),
        @JsonSubTypes.Type(value = GameEvent.RoundSet.class, name = "ROUND_SET"),
        @JsonSubTypes.Type(value = GameEvent.QuestSet.class, name = "QUEST_SET"),
})
public sealed interface GameEvent {

    /** A model joins the table (from the players' lists when the table is created). */
    record ModelAdded(String id, int side, String code, String mount) implements GameEvent {
    }

    record FirstPlayer(int side) implements GameEvent {
    }

    record Deployed(String id, double x, double y, double facing) implements GameEvent {
    }

    record Ready(int side) implements GameEvent {
    }

    /** Activation Step: the active model spends 1 AP. */
    record Activated(String id) implements GameEvent {
    }

    /** A validated Walk/Run: the reachable path, its cost and the enemy now in base contact. */
    record Moved(String id, String mode, List<Vec> path, double cost, double facing, String engagedWith) implements GameEvent {
    }

    /** Placement without rule checks (Climb, Jump, Dodge, pushes); shown as such in the log. */
    record FreeMoved(String id, double x, double y, double facing) implements GameEvent {
    }

    record Rotated(String id, double facing) implements GameEvent {
    }

    /** A reactive model spends 1 AP to react. */
    record Reacted(String id) implements GameEvent {
    }

    /** Server dice: d20 results, the attribute rolled against (success ≤ target) and a label. */
    record Rolled(String label, String id, Integer target, List<Integer> results) implements GameEvent {
    }

    /** Wounds (negative) or healing (positive). */
    record HpChanged(String id, int delta) implements GameEvent {
    }

    record StateSet(String id, ModelState state, boolean on) implements GameEvent {
    }

    /** Manual correction of remaining Activation Points. */
    record ApSet(String id, int ap) implements GameEvent {
    }

    record ActivationEnded() implements GameEvent {
    }

    /** End Phase: unspent AP is discarded, the other player becomes active (Strategic + Upkeep Phases follow). */
    record TurnEnded() implements GameEvent {
    }

    record GameEnded(String reason, Integer winner) implements GameEvent {
    }

    /** Takes back the listed events (never dice). */
    record Undone(List<Long> seqs) implements GameEvent {
    }

    /** A player's list: faction and Leader (INT decides how many Scheme cards are drawn). */
    record PartyInfo(int side, String faction, String alliedFaction, int leaderInt, String leaderId) implements GameEvent {
    }

    record SchemeCard(String scheme, int roll) {
    }

    /** d20 on the faction's Scheme table (server dice, no repeated cards). */
    record SchemesDrawn(int side, List<SchemeCard> cards) implements GameEvent {
    }

    record SchemeKept(int side, String scheme) implements GameEvent {
    }

    /** A Quest token on the field: INTRIGUE, CACHE, SIGIL, OBJECTIVE, TREASURE or MARKER (free label). */
    record TokenPlaced(String id, String kind, double x, double y, String label) implements GameEvent {
    }

    record TokenMoved(String id, double x, double y) implements GameEvent {
    }

    record TokenRemoved(String id) implements GameEvent {
    }

    /** Victory Points of one player in one round: from the Quest and from the Scheme. */
    record VpSet(int side, int round, int scenario, int scheme) implements GameEvent {
    }

    /**
     * An AoE template on the field: CIRCLE_S (70 mm), CIRCLE_L (120 mm), SPRAY_S (213 mm), SPRAY_L (260 mm).
     * Circles: (x, y) is the centre. Sprays: (x, y) is the narrow end (at the attacker), {@code rotation} its direction.
     */
    record TemplatePlaced(String id, String kind, double x, double y, double rotation, String modelId, String label)
            implements GameEvent {
    }

    record TemplateRemoved(String id) implements GameEvent {
    }

    /** One player proposes to end the game; it ends when the other one agrees. */
    record EndProposed(int side) implements GameEvent {
    }

    // ---------- free game (sandbox): the field and the parties are built during the game ----------

    /** A model taken off the table for good (free game). */
    record ModelRemoved(String id) implements GameEvent {
    }

    /** The mat of a free game, copied from the library (its size becomes the field). */
    record BackgroundSet(String backgroundId, String imageId, double widthIn, double heightIn, List<TerrainShapes.Area> areas)
            implements GameEvent {
    }

    /** A terrain piece put on the field of a free game, copied from the library with its shapes. */
    record TerrainPlaced(String id, String assetId, String name, String imageId, double widthIn, double heightIn,
                         List<TerrainShapes.Shape> shapes, double x, double y, double rotation, double scale) implements GameEvent {
    }

    record TerrainMoved(String id, double x, double y, double rotation, double scale) implements GameEvent {
    }

    record TerrainRemoved(String id) implements GameEvent {
    }

    /** The round set by hand (free game). */
    record RoundSet(int round) implements GameEvent {
    }

    /** The quest chosen during a free game (null = none). */
    record QuestSet(String code) implements GameEvent {
    }
}
