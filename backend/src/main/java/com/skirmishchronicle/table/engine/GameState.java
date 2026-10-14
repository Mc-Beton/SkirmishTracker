package com.skirmishchronicle.table.engine;

import com.skirmishchronicle.table.geo.Env;
import com.skirmishchronicle.table.geo.Geometry;
import com.skirmishchronicle.table.geo.Hitbox;
import com.skirmishchronicle.table.geo.Piece;
import com.skirmishchronicle.table.geo.Size;
import com.skirmishchronicle.table.geo.Table;
import com.skirmishchronicle.table.geo.Terrain;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import com.skirmishchronicle.table.rules.Profiles;
import com.skirmishchronicle.table.rules.Stat;
import com.skirmishchronicle.table.rules.Stats;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The state of one table, rebuilt by folding the event log ({@link #apply}). Mutable on purpose: it only
 * lives while a request is handled. Rules applied here are the automatic ones (AP in the Upkeep Phase,
 * Incapacitated at 0 HP, Flying cancelled by Crouched…); permissions are checked in {@link TableEngine}.
 */
public final class GameState {

    public enum Status { SETUP, PLAYING, FINISHED }

    /** One model on the table. */
    public static final class Model {
        public final String id;
        public final int side;
        public final Profiles.Profile profile;
        public final Profiles.Mount mount;
        public Vec pos;
        public double facing;
        public boolean deployed;
        public int hp;
        public int ap;
        public final EnumSet<ModelState> states = EnumSet.noneOf(ModelState.class);

        Model(String id, int side, Profiles.Profile profile, Profiles.Mount mount) {
            this.id = id;
            this.side = side;
            this.profile = profile;
            this.mount = mount;
        }

        public boolean outOfAction() {
            return states.contains(ModelState.DEAD) || states.contains(ModelState.INCAPACITATED);
        }

        public Size size() {
            return mount != null ? mount.size() : profile.size();
        }

        public Set<String> keywords() {
            Set<String> k = new HashSet<>(profile.keywords());
            if (mount != null) {
                k.addAll(mount.keywords());
            }
            return k;
        }
    }

    /** The current Activation Sequence of the active player. */
    public record Activation(String id, Geometry.MoveMode mode, double spent) {
    }

    /**
     * Deployment Zones (Core Rules 2025 and the quests): STANDARD – belts {@code deploymentDepth} deep along the
     * bottom (player 1) and top (player 2) edge; CORNER – quarter circles of {@link #CORNER_RADIUS} in the
     * bottom-left (player 1) and top-right (player 2) corner.
     */
    public enum Deployment { STANDARD, CORNER }

    public static final double CORNER_RADIUS = 9;

    /** Field size; a free game takes it from the chosen mat. */
    public double width;
    public double height;
    public final double deploymentDepth;
    public final Deployment deployment;
    /** World terrain; in a free game rebuilt from the mat and the placed pieces after every change. */
    public List<Terrain> terrain;

    // ---------- free game (sandbox) ----------

    /** Free game: models, the mat and terrain are added during the game; no Deployment Zones are enforced. */
    public boolean sandbox;
    public GameEvent.BackgroundSet background;
    /** Placed terrain pieces of a free game, by id. */
    public final Map<String, GameEvent.TerrainPlaced> pieces = new LinkedHashMap<>();
    public int pieceCounter;
    /** Highest model number used per side (a1, a2… / b1, b2…), also for removed models. */
    public final int[] modelCounter = new int[2];
    /** Quest chosen during a free game (null = the table's quest or none). */
    public String questCode;

    public Status status = Status.SETUP;
    public int round;
    public Integer firstPlayer;
    public int active;
    /** 0 = the first player's turn of the round, 1 = the second. */
    public int turnInRound;
    public Activation activation;
    public final boolean[] ready = new boolean[2];
    public Integer winner;
    public String endReason;
    /** Seq of the event that started the current turn (undo never crosses it). */
    public long turnStartSeq;
    public final Map<String, Model> models = new LinkedHashMap<>();

    // ---------- quest, schemes, tokens, templates, victory points ----------

    public static final int MAX_ROUNDS = 10;

    public record Party(String faction, String alliedFaction, int leaderInt, String leaderId) {
    }

    public record Token(String id, String kind, Vec pos, String label) {
    }

    public record Template(String id, String kind, Vec pos, double rotation, String modelId, String label, int side) {
    }

    public final Party[] parties = new Party[2];
    public final Map<Integer, List<GameEvent.SchemeCard>> schemesDrawn = new java.util.HashMap<>();
    public final Map<Integer, String> schemeKept = new java.util.HashMap<>();
    public final Map<String, Token> tokens = new LinkedHashMap<>();
    public final Map<String, Template> templates = new LinkedHashMap<>();
    /** vp[side][round] = {scenario, scheme}; round 1..MAX_ROUNDS. */
    public final int[][][] vp = new int[2][MAX_ROUNDS + 1][2];
    public int tokenCounter;
    public int templateCounter;
    /** The player who proposed to end the game, or null. */
    public Integer endProposedBy;

    public int totalVp(int side) {
        int sum = 0;
        for (int r = 1; r <= MAX_ROUNDS; r++) {
            sum += vp[side][r][0] + vp[side][r][1];
        }
        return sum;
    }

    public GameState(double width, double height, double deploymentDepth, List<Terrain> terrain) {
        this(width, height, deploymentDepth, Deployment.STANDARD, terrain);
    }

    public GameState(double width, double height, double deploymentDepth, Deployment deployment, List<Terrain> terrain) {
        this.width = width;
        this.height = height;
        this.deploymentDepth = deploymentDepth;
        this.deployment = deployment == null ? Deployment.STANDARD : deployment;
        this.terrain = List.copyOf(terrain);
    }

    public static final int MAX_SANDBOX_MODELS = 40;
    public static final int MAX_SANDBOX_PIECES = 80;

    /** Free game: terrain = mat areas + placed pieces (scaled and turned like on a map). */
    private void rebuildTerrain() {
        List<TerrainShapes.Placement> placements = new ArrayList<>();
        Map<String, TerrainShapes.Asset> assets = new LinkedHashMap<>();
        for (GameEvent.TerrainPlaced p : pieces.values()) {
            placements.add(new TerrainShapes.Placement(p.id(), p.x(), p.y(), p.rotation(), p.scale()));
            assets.put(p.id(), new TerrainShapes.Asset(p.id(), p.widthIn(), p.heightIn(), p.shapes() == null ? List.of() : p.shapes()));
        }
        terrain = List.copyOf(TerrainShapes.build(background == null || background.areas() == null ? List.of() : background.areas(),
                placements, assets));
    }

    public Model model(String id) {
        Model m = models.get(id);
        if (m == null) {
            throw new RuleViolation("TABLE_MODEL_NOT_FOUND");
        }
        return m;
    }

    // ---------- effective stats ----------

    public Map<Stat, Integer> stats(Model m) {
        Map<Stat, Integer> setTo = m.mount != null ? m.mount.set() : Map.of();
        Map<Stat, Integer> flat = m.mount != null ? m.mount.mod() : Map.of();
        Map<Stat, Integer> envHalves = new EnumMap<>(Stat.class);
        if (m.deployed && !m.states.contains(ModelState.FLYING)) {
            Piece p = basicPiece(m, 0, 0);
            boolean inWater = terrain.stream().anyMatch(t -> (t.envs().contains(Env.AQUATIC_SHALLOW) || t.envs().contains(Env.AQUATIC_DEEP))
                    && Geometry.circleTouchesPolygon(m.pos, Hitbox.of(m.size(), false).r(), t.points()));
            if (inWater && !Geometry.survives(p, Env.AQUATIC_SHALLOW)) {
                envHalves.put(Stat.AG, 1); // Aquatic: AG halved
            }
        }
        return Stats.effective(m.profile.stats(), flat, setTo, m.states, envHalves);
    }

    private Piece basicPiece(Model m, double spd, int ag) {
        Set<String> st = new HashSet<>();
        m.states.forEach(s -> st.add(s.name()));
        String faction = m.profile.factions().isEmpty() ? "" : m.profile.factions().get(0);
        return new Piece(m.id, m.side, m.pos == null ? new Vec(-100, -100) : m.pos, m.facing, m.size(), spd, ag, faction,
                m.keywords(), st);
    }

    public Piece piece(Model m) {
        Map<Stat, Integer> s = stats(m);
        return basicPiece(m, s.get(Stat.SPD), s.get(Stat.AG));
    }

    /** The table as the geometry sees it (deployed models only). */
    public Table table() {
        List<Piece> pieces = new ArrayList<>();
        for (Model m : models.values()) {
            if (m.deployed) {
                pieces.add(piece(m));
            }
        }
        return new Table(width, height, terrain, pieces);
    }

    // ---------- reducer ----------

    void apply(Recorded r, Profiles profiles) {
        GameEvent e = r.event();
        switch (e) {
            case GameEvent.ModelAdded a -> {
                Profiles.Profile p = profiles.profile(a.code()).orElseThrow(() -> new IllegalStateException("profile " + a.code()));
                if (a.side() == 0 || a.side() == 1) {
                    try {
                        modelCounter[a.side()] = Math.max(modelCounter[a.side()], Integer.parseInt(a.id().substring(1)));
                    } catch (RuntimeException ignored) {
                        // ids from the lists are a1, b2…; anything else does not count
                    }
                }
                Profiles.Mount mount = a.mount() == null ? null : profiles.mount(a.mount()).orElse(null);
                Model m = new Model(a.id(), a.side(), p, mount);
                models.put(m.id, m);
                m.hp = stats(m).get(Stat.HP);
            }
            case GameEvent.FirstPlayer f -> firstPlayer = f.side();
            case GameEvent.Deployed d -> {
                Model m = model(d.id());
                m.pos = new Vec(d.x(), d.y());
                m.facing = d.facing();
                m.deployed = true;
                ready[m.side] = false;
            }
            case GameEvent.Ready rd -> {
                ready[rd.side()] = true;
                if (ready[0] && ready[1]) {
                    startGame(r.seq());
                }
            }
            case GameEvent.Activated a -> {
                Model m = model(a.id());
                m.ap = Math.max(0, m.ap - 1);
                activation = new Activation(m.id, null, 0);
            }
            case GameEvent.Moved mv -> {
                Model m = model(mv.id());
                m.pos = mv.path().get(mv.path().size() - 1);
                m.facing = mv.facing();
                double spent = activation != null && activation.id().equals(m.id) ? activation.spent() : 0;
                activation = new Activation(m.id, Geometry.MoveMode.valueOf(mv.mode()), spent + mv.cost());
                if (mv.engagedWith() != null) {
                    m.states.add(ModelState.ENGAGED);
                    Model other = models.get(mv.engagedWith());
                    if (other != null && !other.states.contains(ModelState.CROUCHED)) {
                        other.states.add(ModelState.ENGAGED);
                    }
                }
            }
            case GameEvent.FreeMoved fm -> {
                Model m = model(fm.id());
                m.pos = new Vec(fm.x(), fm.y());
                m.facing = fm.facing();
                m.deployed = true;
            }
            case GameEvent.Rotated ro -> model(ro.id()).facing = ro.facing();
            case GameEvent.Reacted re -> {
                Model m = model(re.id());
                m.ap = Math.max(0, m.ap - 1);
            }
            case GameEvent.Rolled ignored -> {
                // dice change nothing by themselves; players apply the outcome (wounds, States)
            }
            case GameEvent.HpChanged h -> changeHp(model(h.id()), h.delta());
            case GameEvent.StateSet s -> setState(model(s.id()), s.state(), s.on());
            case GameEvent.ApSet a -> model(a.id()).ap = Math.max(0, a.ap());
            case GameEvent.ActivationEnded ignored -> activation = null;
            case GameEvent.TurnEnded ignored -> nextTurn(r.seq());
            case GameEvent.GameEnded g -> {
                endProposedBy = null;
                status = Status.FINISHED;
                winner = g.winner();
                endReason = g.reason();
                activation = null;
            }
            case GameEvent.Undone ignored -> {
                // handled by the fold (the listed events are skipped)
            }
            case GameEvent.PartyInfo p -> parties[p.side()] = new Party(p.faction(), p.alliedFaction(), p.leaderInt(), p.leaderId());
            case GameEvent.SchemesDrawn d -> schemesDrawn.put(d.side(), List.copyOf(d.cards()));
            case GameEvent.SchemeKept k -> schemeKept.put(k.side(), k.scheme());
            case GameEvent.TokenPlaced tp -> {
                tokenCounter++;
                tokens.put(tp.id(), new Token(tp.id(), tp.kind(), new Vec(tp.x(), tp.y()), tp.label()));
            }
            case GameEvent.TokenMoved tm -> {
                Token t = tokens.get(tm.id());
                if (t != null) {
                    tokens.put(t.id(), new Token(t.id(), t.kind(), new Vec(tm.x(), tm.y()), t.label()));
                }
            }
            case GameEvent.TokenRemoved tr -> tokens.remove(tr.id());
            case GameEvent.VpSet v -> {
                vp[v.side()][v.round()][0] = v.scenario();
                vp[v.side()][v.round()][1] = v.scheme();
            }
            case GameEvent.TemplatePlaced tp -> {
                templateCounter++;
                templates.put(tp.id(), new Template(tp.id(), tp.kind(), new Vec(tp.x(), tp.y()), tp.rotation(), tp.modelId(),
                        tp.label(), r.side()));
            }
            case GameEvent.TemplateRemoved tr -> templates.remove(tr.id());
            case GameEvent.EndProposed ep -> endProposedBy = ep.side() < 0 ? null : ep.side();
            case GameEvent.ModelRemoved mr -> {
                models.remove(mr.id());
                if (activation != null && activation.id().equals(mr.id())) {
                    activation = null;
                }
            }
            case GameEvent.BackgroundSet b -> {
                background = b;
                width = b.widthIn();
                height = b.heightIn();
                rebuildTerrain();
            }
            case GameEvent.TerrainPlaced tp -> {
                pieceCounter++;
                pieces.put(tp.id(), tp);
                rebuildTerrain();
            }
            case GameEvent.TerrainMoved tm -> {
                GameEvent.TerrainPlaced p = pieces.get(tm.id());
                if (p != null) {
                    pieces.put(p.id(), new GameEvent.TerrainPlaced(p.id(), p.assetId(), p.name(), p.imageId(), p.widthIn(),
                            p.heightIn(), p.shapes(), tm.x(), tm.y(), tm.rotation(), tm.scale()));
                    rebuildTerrain();
                }
            }
            case GameEvent.TerrainRemoved tr -> {
                pieces.remove(tr.id());
                rebuildTerrain();
            }
            case GameEvent.RoundSet rs -> round = rs.round();
            case GameEvent.QuestSet q -> questCode = q.code();
        }
    }

    private void changeHp(Model m, int delta) {
        if (delta < 0) {
            if (m.states.contains(ModelState.DEAD)) {
                return;
            }
            if (m.hp == 0 && m.states.contains(ModelState.INCAPACITATED)) {
                setState(m, ModelState.DEAD, true); // a Wound on an Incapacitated model kills it
                return;
            }
            m.hp = Math.max(0, m.hp + delta);
            if (m.hp == 0) {
                setState(m, ModelState.INCAPACITATED, true);
            }
        } else if (delta > 0) {
            if (m.states.contains(ModelState.DEAD)) {
                return; // a Dead model cannot regain HP (unless an ability says so – then remove Dead first)
            }
            m.hp = Math.min(stats(m).get(Stat.HP), m.hp + delta);
            if (m.hp > 0) {
                m.states.remove(ModelState.INCAPACITATED);
            }
        }
    }

    private void setState(Model m, ModelState s, boolean on) {
        if (!on) {
            m.states.remove(s);
            return;
        }
        m.states.add(s);
        switch (s) {
            case INCAPACITATED -> m.states.add(ModelState.CROUCHED); // and enters Crouched (errata)
            case DEAD -> m.states.remove(ModelState.ENGAGED);
            default -> {
            }
        }
        // Flying is cancelled by Incapacitated, Dead, Immobilized or Crouched
        if (s == ModelState.INCAPACITATED || s == ModelState.DEAD || s == ModelState.IMMOBILIZED || s == ModelState.CROUCHED) {
            m.states.remove(ModelState.FLYING);
        }
        if (s == ModelState.CROUCHED) {
            m.states.remove(ModelState.ENGAGED);
        }
    }

    private void startGame(long seq) {
        status = Status.PLAYING;
        round = 1;
        turnInRound = 0;
        active = firstPlayer == null ? 0 : firstPlayer;
        beginTurn(seq);
    }

    private void nextTurn(long seq) {
        // End Phase: both players discard unspent AP
        for (Model m : models.values()) {
            m.ap = 0;
        }
        activation = null;
        int first = firstPlayer == null ? 0 : firstPlayer;
        if (turnInRound == 0) {
            turnInRound = 1;
            active = 1 - first;
        } else {
            round++;
            turnInRound = 0;
            active = first;
        }
        beginTurn(seq);
    }

    /** Strategic Phase (Fatigued ends for the active player's models), then Upkeep (AP = STA for everybody). */
    private void beginTurn(long seq) {
        turnStartSeq = seq;
        for (Model m : models.values()) {
            if (m.side == active) {
                m.states.remove(ModelState.FATIGUED);
            }
        }
        for (Model m : models.values()) {
            if (m.outOfAction() || m.states.contains(ModelState.FATIGUED)) {
                continue;
            }
            m.ap = stats(m).get(Stat.STA);
        }
    }

    // ---------- fold ----------

    public static GameState fold(double width, double height, double depth, List<Terrain> terrain,
                                 List<Recorded> log, Profiles profiles) {
        return fold(width, height, depth, Deployment.STANDARD, terrain, log, profiles);
    }

    public static GameState fold(double width, double height, double depth, Deployment deployment, List<Terrain> terrain,
                                 List<Recorded> log, Profiles profiles) {
        return fold(width, height, depth, deployment, terrain, log, profiles, false);
    }

    /** {@code sandbox}: a free game (the field is built from the events). */
    public static GameState fold(double width, double height, double depth, Deployment deployment, List<Terrain> terrain,
                                 List<Recorded> log, Profiles profiles, boolean sandbox) {
        Set<Long> undone = undoneSeqs(log);
        GameState s = new GameState(width, height, depth, deployment, terrain);
        s.sandbox = sandbox;
        for (Recorded r : log) {
            if (!undone.contains(r.seq())) {
                s.apply(r, profiles);
            }
        }
        return s;
    }

    public static Set<Long> undoneSeqs(List<Recorded> log) {
        Set<Long> out = new HashSet<>();
        for (Recorded r : log) {
            if (r.event() instanceof GameEvent.Undone u) {
                out.addAll(u.seqs());
            }
        }
        return out;
    }
}
