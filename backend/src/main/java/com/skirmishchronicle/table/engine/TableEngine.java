package com.skirmishchronicle.table.engine;

import com.skirmishchronicle.table.geo.Geometry;
import com.skirmishchronicle.table.geo.Hitbox;
import com.skirmishchronicle.table.geo.MovePlan;
import com.skirmishchronicle.table.geo.Terrain;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import com.skirmishchronicle.table.rules.Profiles;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.random.RandomGenerator;

/**
 * Turns a player's command into events, or refuses it with a {@link RuleViolation}. Pure apart from the dice:
 * the caller loads the log, folds it ({@link GameState#fold}), calls {@link #decide} and stores the events.
 *
 * <p>What the table enforces (the rest is left to the players and shown in the log):
 * <ul>
 *   <li>only the Active Player activates, moves and ends the turn; models act only with AP left;</li>
 *   <li>Walk/Run budget from the effective SPD, the whole route counts, terrain and enemies block
 *       ({@link Geometry#planMove}); Crouched only Walks; Immobilized does not move;</li>
 *   <li>the Reactive Player reacts (spends AP) only while a model is activated;</li>
 *   <li>dice are rolled here; <b>undo</b> is for the Active Player, in the current turn, and never goes back
 *       past dice: once anybody rolled after an action (e.g. a Reaction with a roll), it stays.</li>
 *   <li>the <b>judge</b> ({@link #JUDGE}) places, turns and marks any model, uses tokens, templates and VP,
 *       ends the game and undoes any number of steps (dice and earlier turns included); players cannot undo
 *       past a judge's step.</li>
 * </ul>
 */
public final class TableEngine {

    public static final int MAX_DICE = 20;

    /** Side of the judge's commands (players are 0 and 1, the system -1). */
    public static final int JUDGE = 2;

    /** Events that can be taken back. Dice, turn changes and the end of the game cannot. */
    static final Set<Class<? extends GameEvent>> UNDOABLE = Set.of(
            GameEvent.Deployed.class, GameEvent.Ready.class, GameEvent.FirstPlayer.class, GameEvent.Activated.class,
            GameEvent.Moved.class, GameEvent.FreeMoved.class, GameEvent.Rotated.class, GameEvent.Reacted.class,
            GameEvent.HpChanged.class, GameEvent.StateSet.class, GameEvent.ApSet.class, GameEvent.ActivationEnded.class,
            GameEvent.TokenPlaced.class, GameEvent.TokenMoved.class, GameEvent.TokenRemoved.class, GameEvent.VpSet.class,
            GameEvent.TemplatePlaced.class, GameEvent.TemplateRemoved.class, GameEvent.EndProposed.class);

    public static final Set<String> TOKEN_KINDS = Set.of("INTRIGUE", "CACHE", "SIGIL", "OBJECTIVE", "TREASURE", "MARKER");
    public static final Set<String> TEMPLATE_KINDS = Set.of("CIRCLE_S", "CIRCLE_L", "SPRAY_S", "SPRAY_L");
    public static final int MAX_TOKENS = 60;
    public static final int MAX_TEMPLATES = 20;
    public static final int MAX_VP_PER_ROUND = 30;

    private final Profiles profiles;
    private final RandomGenerator dice;

    public TableEngine(Profiles profiles, RandomGenerator dice) {
        this.profiles = profiles;
        this.dice = dice;
    }

    public Profiles profiles() {
        return profiles;
    }

    /**
     * @param side 0 or 1 – the player sending the command, or {@link #JUDGE}
     * @param log  the full log (needed for undo)
     */
    public List<GameEvent> decide(GameState s, List<Recorded> log, int side, Command cmd) {
        if (side == JUDGE) {
            return judge(s, log, cmd);
        }
        if (s.status == GameState.Status.FINISHED && !(cmd instanceof Command.Roll)) {
            throw new RuleViolation("TABLE_GAME_FINISHED");
        }
        return switch (cmd) {
            case Command.SetFirstPlayer f -> {
                setup(s);
                if (f.side() != 0 && f.side() != 1) {
                    throw new RuleViolation("TABLE_BAD_SIDE");
                }
                yield List.of(new GameEvent.FirstPlayer(f.side()));
            }
            case Command.Deploy d -> {
                setup(s);
                GameState.Model m = own(s, side, d.id());
                checkDeployment(s, m, d.pos());
                yield List.of(new GameEvent.Deployed(m.id, d.pos().x(), d.pos().y(), norm(d.facing())));
            }
            case Command.Ready r -> {
                setup(s);
                if (s.models.values().stream().anyMatch(m -> m.side == side && !m.deployed)) {
                    throw new RuleViolation("TABLE_DEPLOY_ALL_FIRST");
                }
                if (s.ready[side]) {
                    throw new RuleViolation("TABLE_ALREADY_READY");
                }
                if (s.firstPlayer == null && s.ready[1 - side]) {
                    throw new RuleViolation("TABLE_FIRST_PLAYER_MISSING");
                }
                yield List.of(new GameEvent.Ready(side));
            }
            case Command.Activate a -> {
                activeTurn(s, side);
                GameState.Model m = own(s, side, a.id());
                if (m.outOfAction()) {
                    throw new RuleViolation("TABLE_MODEL_OUT_OF_ACTION");
                }
                if (m.ap < 1) {
                    throw new RuleViolation("TABLE_NO_AP");
                }
                List<GameEvent> out = new ArrayList<>();
                if (s.activation != null) {
                    out.add(new GameEvent.ActivationEnded());
                }
                out.add(new GameEvent.Activated(m.id));
                yield out;
            }
            case Command.Move mv -> List.of(move(s, side, mv));
            case Command.FreeMove fm -> {
                GameState.Model m = own(s, side, fm.id());
                if (s.status == GameState.Status.PLAYING && side != s.active) {
                    // the Reactive Player may still place its own model (e.g. a successful Dodge) – logged as free
                    if (s.activation == null) {
                        throw new RuleViolation("TABLE_NOT_YOUR_TURN");
                    }
                }
                baseOnTable(s, m, fm.pos());
                yield List.of(new GameEvent.FreeMoved(m.id, fm.pos().x(), fm.pos().y(), norm(fm.facing())));
            }
            case Command.Rotate ro -> {
                GameState.Model m = own(s, side, ro.id());
                if (!m.deployed) {
                    throw new RuleViolation("TABLE_NOT_DEPLOYED");
                }
                yield List.of(new GameEvent.Rotated(m.id, norm(ro.facing())));
            }
            case Command.React re -> {
                playing(s);
                if (side == s.active) {
                    throw new RuleViolation("TABLE_REACT_ONLY_REACTIVE");
                }
                if (s.activation == null) {
                    throw new RuleViolation("TABLE_NOTHING_TO_REACT_TO");
                }
                GameState.Model m = own(s, side, re.id());
                if (m.outOfAction()) {
                    throw new RuleViolation("TABLE_MODEL_OUT_OF_ACTION");
                }
                if (m.ap < 1) {
                    throw new RuleViolation("TABLE_NO_AP");
                }
                yield List.of(new GameEvent.Reacted(m.id));
            }
            case Command.Roll r -> {
                if (r.count() < 1 || r.count() > MAX_DICE) {
                    throw new RuleViolation("TABLE_BAD_DICE_COUNT");
                }
                if (r.target() != null && (r.target() < 0 || r.target() > 40)) {
                    throw new RuleViolation("TABLE_BAD_DICE_TARGET");
                }
                if (r.id() != null) {
                    s.model(r.id());
                }
                List<Integer> res = new ArrayList<>();
                for (int i = 0; i < r.count(); i++) {
                    res.add(dice.nextInt(1, 21));
                }
                String label = r.label() == null ? null : r.label().strip();
                yield List.of(new GameEvent.Rolled(label == null || label.isEmpty() ? null : label, r.id(), r.target(), res));
            }
            case Command.ChangeHp h -> {
                // either player marks wounds on any model (the attacker usually does) – every change is in the log
                GameState.Model m = s.model(h.id());
                if (h.delta() == 0 || Math.abs(h.delta()) > 50) {
                    throw new RuleViolation("TABLE_BAD_HP_CHANGE");
                }
                if (!m.deployed && s.status != GameState.Status.SETUP) {
                    throw new RuleViolation("TABLE_NOT_DEPLOYED");
                }
                yield List.of(new GameEvent.HpChanged(m.id, h.delta()));
            }
            case Command.SetState st -> {
                GameState.Model m = s.model(st.id());
                if (st.on() == m.states.contains(st.state())) {
                    throw new RuleViolation("TABLE_STATE_UNCHANGED");
                }
                if (st.on() && st.state() == ModelState.CROUCHED && m.states.contains(ModelState.FLYING)) {
                    throw new RuleViolation("TABLE_FLYING_CANNOT_CROUCH");
                }
                if (st.on() && st.state() == ModelState.FLYING && !m.keywords().contains("FLIGHT")) {
                    throw new RuleViolation("TABLE_NO_FLIGHT");
                }
                yield List.of(new GameEvent.StateSet(m.id, st.state(), st.on()));
            }
            case Command.SetAp a -> {
                GameState.Model m = own(s, side, a.id());
                if (a.ap() < 0 || a.ap() > 10) {
                    throw new RuleViolation("TABLE_BAD_AP");
                }
                yield List.of(new GameEvent.ApSet(m.id, a.ap()));
            }
            case Command.EndActivation e -> {
                activeTurn(s, side);
                if (s.activation == null) {
                    throw new RuleViolation("TABLE_NO_ACTIVATION");
                }
                yield List.of(new GameEvent.ActivationEnded());
            }
            case Command.EndTurn e -> {
                activeTurn(s, side);
                yield List.of(new GameEvent.TurnEnded());
            }
            case Command.Undo u -> List.of(undo(s, log, side));
            case Command.Concede c -> List.of(new GameEvent.GameEnded("CONCEDED", 1 - side));
            case Command.DrawSchemes d -> {
                // before the game; a player who missed it may still draw during the first round
                if (s.status != GameState.Status.SETUP && !(s.status == GameState.Status.PLAYING && s.round <= 1)) {
                    throw new RuleViolation("TABLE_SETUP_OVER");
                }
                if (s.schemesDrawn.containsKey(side)) {
                    throw new RuleViolation("TABLE_SCHEMES_ALREADY_DRAWN");
                }
                if (d.cards() == null || d.cards().isEmpty()) {
                    throw new RuleViolation("TABLE_BAD_COMMAND");
                }
                yield List.of(new GameEvent.SchemesDrawn(side, d.cards()));
            }
            case Command.KeepScheme k -> {
                List<GameEvent.SchemeCard> drawn = s.schemesDrawn.get(side);
                if (drawn == null) {
                    throw new RuleViolation("TABLE_SCHEMES_NOT_DRAWN");
                }
                if (s.schemeKept.containsKey(side)) {
                    throw new RuleViolation("TABLE_SCHEME_ALREADY_KEPT");
                }
                if (drawn.stream().noneMatch(c -> c.scheme().equals(k.scheme()))) {
                    throw new RuleViolation("TABLE_SCHEME_NOT_DRAWN");
                }
                yield List.of(new GameEvent.SchemeKept(side, k.scheme()));
            }
            case Command.PlaceToken tp -> {
                if (!TOKEN_KINDS.contains(tp.kind())) {
                    throw new RuleViolation("TABLE_BAD_TOKEN");
                }
                if (s.tokens.size() >= MAX_TOKENS) {
                    throw new RuleViolation("TABLE_TOO_MANY_TOKENS");
                }
                inField(s, tp.pos());
                yield List.of(new GameEvent.TokenPlaced("t" + (s.tokenCounter + 1), tp.kind(), tp.pos().x(), tp.pos().y(), label(tp.label())));
            }
            case Command.MoveToken tm -> {
                token(s, tm.id());
                inField(s, tm.pos());
                yield List.of(new GameEvent.TokenMoved(tm.id(), tm.pos().x(), tm.pos().y()));
            }
            case Command.RemoveToken tr -> {
                token(s, tr.id());
                yield List.of(new GameEvent.TokenRemoved(tr.id()));
            }
            case Command.SetVp v -> {
                playing(s);
                if (v.side() != 0 && v.side() != 1) {
                    throw new RuleViolation("TABLE_BAD_SIDE");
                }
                if (v.round() < 1 || v.round() > Math.min(s.round, GameState.MAX_ROUNDS)) {
                    throw new RuleViolation("TABLE_BAD_ROUND");
                }
                if (v.scenario() < 0 || v.scheme() < 0 || v.scenario() + v.scheme() > MAX_VP_PER_ROUND) {
                    throw new RuleViolation("TABLE_BAD_VP");
                }
                yield List.of(new GameEvent.VpSet(v.side(), v.round(), v.scenario(), v.scheme()));
            }
            case Command.PlaceTemplate tp -> {
                playing(s);
                if (!TEMPLATE_KINDS.contains(tp.kind())) {
                    throw new RuleViolation("TABLE_BAD_TEMPLATE");
                }
                if (s.templates.size() >= MAX_TEMPLATES) {
                    throw new RuleViolation("TABLE_TOO_MANY_TEMPLATES");
                }
                inField(s, tp.pos());
                if (tp.modelId() != null) {
                    s.model(tp.modelId());
                }
                yield List.of(new GameEvent.TemplatePlaced("s" + (s.templateCounter + 1), tp.kind(), tp.pos().x(), tp.pos().y(),
                        norm(tp.rotation()), tp.modelId(), label(tp.label())));
            }
            case Command.RemoveTemplate tr -> {
                if (!s.templates.containsKey(tr.id())) {
                    throw new RuleViolation("TABLE_TEMPLATE_NOT_FOUND");
                }
                yield List.of(new GameEvent.TemplateRemoved(tr.id()));
            }
            case Command.EndGame e -> {
                playing(s);
                if (s.endProposedBy == null) {
                    yield List.of(new GameEvent.EndProposed(side));
                }
                if (s.endProposedBy == side) {
                    yield List.of(new GameEvent.EndProposed(-1)); // withdrawn
                }
                int a = s.totalVp(0), b = s.totalVp(1);
                yield List.of(new GameEvent.GameEnded("FINISHED", a == b ? null : a > b ? 0 : 1));
            }
        };
    }

    /** The judge: anything on any model, the end of the game and unlimited undo; not the players' sequence. */
    private List<GameEvent> judge(GameState s, List<Recorded> log, Command cmd) {
        if (cmd instanceof Command.Undo u) {
            return List.of(judgeUndo(log, u.toSeq()));
        }
        if (s.status == GameState.Status.FINISHED && !(cmd instanceof Command.Roll)) {
            throw new RuleViolation("TABLE_GAME_FINISHED");
        }
        return switch (cmd) {
            case Command.Deploy d -> {
                setup(s);
                GameState.Model m = s.model(d.id());
                checkDeployment(s, m, d.pos());
                yield List.of(new GameEvent.Deployed(m.id, d.pos().x(), d.pos().y(), norm(d.facing())));
            }
            case Command.FreeMove fm -> {
                GameState.Model m = deployed(s, fm.id());
                baseOnTable(s, m, fm.pos());
                yield List.of(new GameEvent.FreeMoved(m.id, fm.pos().x(), fm.pos().y(), norm(fm.facing())));
            }
            case Command.Rotate ro -> List.of(new GameEvent.Rotated(deployed(s, ro.id()).id, norm(ro.facing())));
            case Command.SetAp a -> {
                GameState.Model m = s.model(a.id());
                if (a.ap() < 0 || a.ap() > 10) {
                    throw new RuleViolation("TABLE_BAD_AP");
                }
                yield List.of(new GameEvent.ApSet(m.id, a.ap()));
            }
            case Command.EndGame e -> {
                playing(s);
                int a = s.totalVp(0), b = s.totalVp(1);
                yield List.of(new GameEvent.GameEnded("FINISHED", a == b ? null : a > b ? 0 : 1));
            }
            case Command.Roll r -> decide(s, log, -1, r);
            case Command.ChangeHp h -> decide(s, log, -1, h);
            case Command.SetState st -> decide(s, log, -1, st);
            case Command.PlaceToken tp -> decide(s, log, -1, tp);
            case Command.MoveToken tm -> decide(s, log, -1, tm);
            case Command.RemoveToken tr -> decide(s, log, -1, tr);
            case Command.SetVp v -> decide(s, log, -1, v);
            case Command.PlaceTemplate tp -> decide(s, log, -1, tp);
            case Command.RemoveTemplate tr -> decide(s, log, -1, tr);
            default -> throw new RuleViolation("TABLE_JUDGE_CANNOT");
        };
    }

    /** Everything after {@code toSeq} (or only the latest step) that a player or the judge did – never the setup from the lists. */
    private static GameEvent judgeUndo(List<Recorded> log, Long toSeq) {
        if (toSeq != null && toSeq < 0) {
            throw new RuleViolation("TABLE_BAD_COMMAND");
        }
        Set<Long> undone = GameState.undoneSeqs(log);
        List<Long> live = log.stream()
                .filter(r -> r.side() >= 0 && !undone.contains(r.seq()) && !(r.event() instanceof GameEvent.Undone))
                .map(Recorded::seq).toList();
        List<Long> seqs = toSeq == null
                ? (live.isEmpty() ? List.of() : List.of(live.get(live.size() - 1)))
                : live.stream().filter(q -> q > toSeq).toList();
        if (seqs.isEmpty()) {
            throw new RuleViolation("TABLE_NOTHING_TO_UNDO");
        }
        return new GameEvent.Undone(seqs);
    }

    private static GameState.Model deployed(GameState s, String id) {
        GameState.Model m = s.model(id);
        if (!m.deployed) {
            throw new RuleViolation("TABLE_NOT_DEPLOYED");
        }
        return m;
    }

    private static void baseOnTable(GameState s, GameState.Model m, Vec p) {
        Hitbox b = Hitbox.of(m.size(), false);
        if (p.x() - b.r() < -1e-6 || p.y() - b.r() < -1e-6 || p.x() + b.r() > s.width + 1e-6 || p.y() + b.r() > s.height + 1e-6) {
            throw new RuleViolation("TABLE_OFF_THE_TABLE");
        }
    }

    private GameEvent move(GameState s, int side, Command.Move mv) {
        activeTurn(s, side);
        GameState.Model m = own(s, side, mv.id());
        if (s.activation == null || !s.activation.id().equals(m.id)) {
            throw new RuleViolation("TABLE_ACTIVATE_FIRST");
        }
        if (m.states.contains(ModelState.IMMOBILIZED)) {
            throw new RuleViolation("TABLE_IMMOBILIZED");
        }
        if (mv.mode() == Geometry.MoveMode.RUN && m.states.contains(ModelState.CROUCHED)) {
            throw new RuleViolation("TABLE_CROUCHED_WALK_ONLY");
        }
        if (s.activation.mode() != null && s.activation.mode() != mv.mode()) {
            throw new RuleViolation("TABLE_MOVE_MODE_FIXED");
        }
        if (mv.waypoints() == null || mv.waypoints().isEmpty() || mv.waypoints().size() > 20) {
            throw new RuleViolation("TABLE_BAD_ROUTE");
        }
        var table = s.table();
        double budget = Geometry.moveBudget(table.piece(m.id), mv.mode()) - s.activation.spent();
        if (budget <= 0.005) {
            throw new RuleViolation("TABLE_NO_MOVEMENT_LEFT");
        }
        MovePlan plan = Geometry.planMove(table, m.id, mv.waypoints(), budget);
        if (plan.endsOnAlly() != null) {
            throw new RuleViolation("TABLE_ENDS_ON_ALLY");
        }
        if (plan.length() < 0.01) {
            throw new RuleViolation("TABLE_ROUTE_BLOCKED");
        }
        List<Vec> path = plan.path();
        Vec a = path.get(path.size() - 2), b = path.get(path.size() - 1);
        double facing = norm(Math.toDegrees(Math.atan2(b.y() - a.y(), b.x() - a.x())));
        return new GameEvent.Moved(m.id, mv.mode().name(), path, plan.cost(), facing, plan.engagedWith());
    }

    /**
     * Takes back the requester's latest action of the current turn together with everything after it, as long as
     * no dice were rolled since. Only the Active Player undoes during the game; in setup each player undoes own steps.
     */
    private GameEvent undo(GameState s, List<Recorded> log, int side) {
        if (s.status == GameState.Status.PLAYING && side != s.active) {
            throw new RuleViolation("TABLE_UNDO_ONLY_ACTIVE");
        }
        Set<Long> undone = GameState.undoneSeqs(log);
        List<Recorded> live = log.stream().filter(r -> !undone.contains(r.seq()) && !(r.event() instanceof GameEvent.Undone)).toList();
        long floor = s.status == GameState.Status.PLAYING ? s.turnStartSeq : 0;
        for (int i = live.size() - 1; i >= 0; i--) {
            Recorded r = live.get(i);
            if (r.seq() <= floor) {
                break;
            }
            if (r.event() instanceof GameEvent.Rolled) {
                throw new RuleViolation("TABLE_UNDO_AFTER_DICE");
            }
            if (r.side() == JUDGE) {
                throw new RuleViolation("TABLE_UNDO_AFTER_JUDGE");
            }
            if (r.side() == side && UNDOABLE.contains(r.event().getClass())) {
                List<Long> seqs = new ArrayList<>();
                for (int k = i; k < live.size(); k++) {
                    if (!UNDOABLE.contains(live.get(k).event().getClass())) {
                        throw new RuleViolation("TABLE_NOTHING_TO_UNDO");
                    }
                    seqs.add(live.get(k).seq());
                }
                return new GameEvent.Undone(seqs);
            }
        }
        throw new RuleViolation("TABLE_NOTHING_TO_UNDO");
    }

    private void checkDeployment(GameState s, GameState.Model m, Vec p) {
        Hitbox b = Hitbox.of(m.size(), false);
        if (p.x() - b.r() < -1e-6 || p.x() + b.r() > s.width + 1e-6) {
            throw new RuleViolation("TABLE_OUTSIDE_DEPLOYMENT");
        }
        // player 0 deploys along the bottom edge, player 1 along the top edge; the base must be fully inside
        boolean inZone = m.side == 0
                ? p.y() - b.r() >= s.height - s.deploymentDepth - 1e-6 && p.y() + b.r() <= s.height + 1e-6
                : p.y() - b.r() >= -1e-6 && p.y() + b.r() <= s.deploymentDepth + 1e-6;
        if (!inZone) {
            throw new RuleViolation("TABLE_OUTSIDE_DEPLOYMENT");
        }
        for (GameState.Model o : s.models.values()) {
            if (o != m && o.deployed && o.pos.dist(p) < b.r() + Hitbox.of(o.size(), false).r() - 1e-6) {
                throw new RuleViolation("TABLE_OVERLAPS_MODEL");
            }
        }
        for (Terrain t : s.terrain) {
            if (t.kind() == Terrain.Kind.OBSTACLE && t.height() > b.h() && Geometry.distPointPolygon(p, t.points()) < b.r() - 1e-6) {
                throw new RuleViolation("TABLE_OVERLAPS_TERRAIN");
            }
        }
    }

    private static void inField(GameState s, Vec p) {
        if (p.x() < 0 || p.y() < 0 || p.x() > s.width || p.y() > s.height) {
            throw new RuleViolation("TABLE_OFF_THE_TABLE");
        }
    }

    private static void token(GameState s, String id) {
        if (!s.tokens.containsKey(id)) {
            throw new RuleViolation("TABLE_TOKEN_NOT_FOUND");
        }
    }

    private static String label(String l) {
        if (l == null || l.isBlank()) {
            return null;
        }
        String t = l.strip();
        return t.length() > 40 ? t.substring(0, 40) : t;
    }

    private static GameState.Model own(GameState s, int side, String id) {
        GameState.Model m = s.model(id);
        if (m.side != side) {
            throw new RuleViolation("TABLE_NOT_YOUR_MODEL");
        }
        return m;
    }

    private static void setup(GameState s) {
        if (s.status != GameState.Status.SETUP) {
            throw new RuleViolation("TABLE_SETUP_OVER");
        }
    }

    private static void playing(GameState s) {
        if (s.status != GameState.Status.PLAYING) {
            throw new RuleViolation("TABLE_NOT_STARTED");
        }
    }

    private static void activeTurn(GameState s, int side) {
        playing(s);
        if (side != s.active) {
            throw new RuleViolation("TABLE_NOT_YOUR_TURN");
        }
    }

    static double norm(double deg) {
        double d = deg % 360;
        if (d < 0) {
            d += 360;
        }
        return Math.round(d * 100) / 100.0;
    }
}
