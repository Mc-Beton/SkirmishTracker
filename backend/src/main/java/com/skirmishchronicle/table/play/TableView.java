package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.databind.JsonNode;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.Stat;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything a player's browser needs to draw the table: map art, world terrain (for the movement and LoS
 * preview), models with printed and effective stats, the game sequence and the recent log. Also sent to the judge
 * and observers ({@code role}); {@code you} is -1 for them.
 */
public record TableView(UUID id, String status, String mapName, String questCode, Field field, Background background,
                        List<Placed> placements, List<TerrainView> terrain, List<Player> players, int you, Game game,
                        List<ModelView> models, List<PartyView> parties, List<Token> tokens, List<Template> templates,
                        List<VpRow> vp, int[] vpTotal, Integer endProposedBy, UUID reportedGameId, List<LogEntry> log,
                        boolean canUndo, long seq, String measureMode, String role, boolean observersAllowed,
                        Player judge, boolean creator) {

    /** A player's list: faction, Leader and Scheme cards (drawn and kept – public, as in the rules). */
    public record PartyView(int side, String faction, int leaderInt, String leaderId, List<SchemeCard> drawn, String kept) {
    }

    public record SchemeCard(String scheme, int roll) {
    }

    public record Token(String id, String kind, double x, double y, String label) {
    }

    public record Template(String id, String kind, double x, double y, double rotation, String modelId, String label, int side) {
    }

    /** Victory Points of a player in a round. */
    public record VpRow(int side, int round, int scenario, int scheme) {
    }

    /** Deployment: STANDARD belts {@code deploymentDepth} deep, or CORNER quarter circles of {@code cornerRadius}. */
    public record Field(double widthIn, double heightIn, double deploymentDepth, String deployment, double cornerRadius) {
    }

    public record Background(UUID imageId, double widthIn, double heightIn) {
    }

    /** A placed terrain picture: centre, rotation and real size of the art (already multiplied by the placement scale). */
    public record Placed(String assetId, UUID imageId, double widthIn, double heightIn, double x, double y, double rotation) {
    }

    public record TerrainView(String id, String kind, List<Vec> points, double height, List<String> envs) {
    }

    public record Player(int side, UUID userId, String name) {
    }

    /** Remaining movement of the activated model: walk/run budget and what was already spent. */
    public record ActivationView(String id, String mode, double spent, double walk, double run) {
    }

    public record Game(String status, int round, int active, int turnInRound, Integer firstPlayer, boolean[] ready,
                       ActivationView activation, Integer winner, String endReason) {
    }

    public record ModelView(String id, int side, String code, String name, String size, int baseMm, int heightMm,
                            String mount, boolean deployed, Double x, Double y, double facing, int hp, int maxHp, int ap,
                            List<String> states, Map<Stat, Integer> base, Map<Stat, Integer> stats, List<String> keywords,
                            List<String> classes, String faction) {
    }

    public record LogEntry(long seq, int side, String type, JsonNode data, Instant at, boolean undone) {
    }
}
