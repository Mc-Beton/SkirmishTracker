package com.skirmishchronicle.table.geo;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * Table geometry (Eldfall Chronicles, Core Rules v1.6 + errata APR 2026). Java twin of
 * {@code frontend/src/lib/table/geometry.ts}: same algorithms and sampling constants, checked against the
 * shared vectors in {@code src/test/resources/table/vectors.json}. The browser uses its copy for previews,
 * the server decides.
 *
 * <p>Units: inches, plan view, origin top-left, y down. Heights in inches above the field.
 */
public final class Geometry {

    static final double EPS = 1e-9;
    /** Step for integrating the movement cost through slow Environments. */
    static final double COST_STEP = 0.05;
    static final int ARC_SAMPLES = 9;
    static final int TARGET_SAMPLES = 12;
    static final double[] Z_FRACTIONS = {0.95, 0.5};

    public static final Set<Env> SLOW_ENVS = Set.of(Env.DIFFICULT, Env.MOUNTAINOUS, Env.AQUATIC_SHALLOW, Env.AQUATIC_DEEP);

    private Geometry() {
    }

    // ---------- pieces ----------

    public static Hitbox box(Piece p) {
        return Hitbox.of(p.size(), p.in("CROUCHED") || p.in("DEAD"));
    }

    /** Survival (X) lists Environments the model ignores; Aquatic covers both water depths. */
    public static boolean survives(Piece p, Env env) {
        String key = env == Env.AQUATIC_SHALLOW || env == Env.AQUATIC_DEEP ? "AQUATIC" : env.name();
        for (String k : p.keywords()) {
            if (k.startsWith("SURVIVAL:") && List.of(k.substring(9).split(",")).contains(key)) {
                return true;
            }
        }
        return false;
    }

    public static boolean isSlowedBy(Piece p, Env env) {
        if (!SLOW_ENVS.contains(env) || p.in("FLYING")) {
            return false;
        }
        if (env != Env.AQUATIC_SHALLOW && env != Env.AQUATIC_DEEP && p.has("FLICKER")) {
            return false;
        }
        return !survives(p, env);
    }

    // ---------- polygon helpers ----------

    public static boolean pointInPolygon(Vec pt, List<Vec> poly) {
        boolean inside = false;
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            Vec a = poly.get(i), b = poly.get(j);
            if ((a.y() > pt.y()) != (b.y() > pt.y())
                    && pt.x() < (b.x() - a.x()) * (pt.y() - a.y()) / (b.y() - a.y()) + a.x()) {
                inside = !inside;
            }
        }
        return inside;
    }

    public static double distPointSegment(Vec p, Vec a, Vec b) {
        Vec ab = b.minus(a);
        double l2 = ab.dot(ab);
        double t = l2 < EPS ? 0 : Math.max(0, Math.min(1, p.minus(a).dot(ab) / l2));
        return p.dist(a.lerp(b, t));
    }

    static boolean segmentsIntersect(Vec a, Vec b, Vec c, Vec d) {
        double d1 = b.minus(a).cross(c.minus(a)), d2 = b.minus(a).cross(d.minus(a));
        double d3 = d.minus(c).cross(a.minus(c)), d4 = d.minus(c).cross(b.minus(c));
        return d1 * d2 < 0 && d3 * d4 < 0;
    }

    public static double distSegmentSegment(Vec a, Vec b, Vec c, Vec d) {
        if (segmentsIntersect(a, b, c, d)) {
            return 0;
        }
        return Math.min(Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d)),
                Math.min(distPointSegment(c, a, b), distPointSegment(d, a, b)));
    }

    public static double distPointPolygon(Vec p, List<Vec> poly) {
        if (pointInPolygon(p, poly)) {
            return 0;
        }
        double m = Double.POSITIVE_INFINITY;
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            m = Math.min(m, distPointSegment(p, poly.get(j), poly.get(i)));
        }
        return m;
    }

    public static double distSegmentPolygon(Vec a, Vec b, List<Vec> poly) {
        if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) {
            return 0;
        }
        double m = Double.POSITIVE_INFINITY;
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            m = Math.min(m, distSegmentSegment(a, b, poly.get(j), poly.get(i)));
        }
        return m;
    }

    public static boolean circleTouchesPolygon(Vec c, double r, List<Vec> poly) {
        return distPointPolygon(c, poly) <= r + EPS;
    }

    /** Parameter intervals where segment a→b is inside the (possibly concave) polygon. */
    public static List<double[]> insideIntervals(Vec a, Vec b, List<Vec> poly) {
        List<Double> ts = new ArrayList<>(List.of(0.0, 1.0));
        Vec ab = b.minus(a);
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            Vec c = poly.get(j), cd = poly.get(i).minus(c);
            double den = ab.cross(cd);
            if (Math.abs(den) < EPS) {
                continue;
            }
            double t = c.minus(a).cross(cd) / den;
            double u = c.minus(a).cross(ab) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) {
                ts.add(t);
            }
        }
        ts.sort(Double::compare);
        List<double[]> out = new ArrayList<>();
        for (int k = 0; k + 1 < ts.size(); k++) {
            double t0 = ts.get(k), t1 = ts.get(k + 1);
            if (t1 - t0 < EPS) {
                continue;
            }
            if (pointInPolygon(a.lerp(b, (t0 + t1) / 2), poly)) {
                double[] last = out.isEmpty() ? null : out.get(out.size() - 1);
                if (last != null && Math.abs(last[1] - t0) < EPS) {
                    last[1] = t1;
                } else {
                    out.add(new double[] {t0, t1});
                }
            }
        }
        return out;
    }

    /** Interval where segment a→b is inside a circle, or null. */
    public static double[] circleInterval(Vec a, Vec b, Vec c, double r) {
        Vec d = b.minus(a), f = a.minus(c);
        double A = d.dot(d), B = 2 * f.dot(d), C = f.dot(f) - r * r;
        if (A < EPS) {
            return C <= 0 ? new double[] {0, 1} : null;
        }
        double disc = B * B - 4 * A * C;
        if (disc <= 0) {
            return null;
        }
        double s = Math.sqrt(disc);
        double t0 = Math.max(0, (-B - s) / (2 * A)), t1 = Math.min(1, (-B + s) / (2 * A));
        return t0 < t1 ? new double[] {t0, t1} : null;
    }

    // ---------- movement ----------

    public enum MoveMode { WALK, RUN }

    /** {@link Piece#spd()} is the effective SPD (State modifiers applied); Crouched may only Walk. */
    public static double moveBudget(Piece p, MoveMode mode) {
        return mode == MoveMode.RUN && !p.in("CROUCHED") ? p.spd() * 2 : p.spd();
    }

    /**
     * Validates a route of base-centre waypoints and returns its reachable part. Same rules as the TS twin:
     * scenery taller than the hitbox and Unscalable (without Climbing/Flicker) block, slow Environments cost
     * double, enemies end the movement in base contact, the base stays on the table.
     *
     * @param budget inches of movement still available (already includes Walk/Run and State modifiers)
     */
    public static MovePlan planMove(Table table, String pieceId, List<Vec> waypoints, double budget) {
        Piece p = table.piece(pieceId);
        Hitbox box = box(p);
        boolean flying = p.in("FLYING");
        List<Vec> path = new ArrayList<>(List.of(p.pos()));
        double cost = 0, length = 0;
        MovePlan.Block stoppedBy = null;
        String engagedWith = null;

        List<Piece> enemies = table.pieces().stream()
                .filter(x -> x.side() != p.side() && !x.id().equals(p.id()) && !x.in("DEAD")).toList();
        List<Terrain> slowAreas = table.terrain().stream()
                .filter(t -> t.envs().stream().anyMatch(e -> isSlowedBy(p, e))).toList();

        Vec cur = p.pos();
        outer:
        for (Vec target : waypoints) {
            double tBlock = 1;
            MovePlan.Block block = null;

            final Vec from = cur;
            java.util.function.Predicate<Vec> inField = q -> q.x() - box.r() >= -EPS && q.y() - box.r() >= -EPS
                    && q.x() + box.r() <= table.width() + EPS && q.y() + box.r() <= table.height() + EPS;
            if (!inField.test(target)) {
                double t = firstFailure(from, target, inField);
                if (t < tBlock) {
                    tBlock = t;
                    block = new MovePlan.Block("EDGE", null);
                }
            }

            if (!flying) {
                for (Terrain t : table.terrain()) {
                    boolean unscalable = t.envs().contains(Env.UNSCALABLE) && !p.has("CLIMBING") && !p.has("FLICKER");
                    boolean tooHigh = t.kind() == Terrain.Kind.OBSTACLE && t.height() > box.h() + EPS;
                    if (!unscalable && !tooHigh) {
                        continue;
                    }
                    if (distSegmentPolygon(from, target, t.points()) >= box.r()) {
                        continue;
                    }
                    double tt = firstFailure(from, target, q -> distPointPolygon(q, t.points()) >= box.r() - 1e-6);
                    if (tt < tBlock) {
                        tBlock = tt;
                        block = new MovePlan.Block(unscalable ? "UNSCALABLE" : "TERRAIN", t.id());
                    }
                }
            }

            String contactEnemy = null;
            if (!flying) {
                for (Piece e : enemies) {
                    double rr = box.r() + box(e).r();
                    if (from.dist(e.pos()) <= rr + 1e-6) {
                        continue; // already in contact: may move away
                    }
                    double[] iv = circleInterval(from, target, e.pos(), rr);
                    if (iv != null && iv[0] < tBlock) {
                        tBlock = iv[0];
                        block = null;
                        contactEnemy = e.id();
                    }
                }
            }

            Vec segEnd = from.lerp(target, tBlock);
            double segLen = from.dist(segEnd);
            int steps = Math.max(1, (int) Math.ceil(segLen / COST_STEP));
            Vec prev = from;
            for (int i = 1; i <= steps; i++) {
                Vec q = from.lerp(segEnd, (double) i / steps);
                Vec mid = prev.lerp(q, 0.5);
                double stepLen = prev.dist(q);
                boolean slowed = false;
                for (Terrain t : slowAreas) {
                    if (circleTouchesPolygon(mid, box.r(), t.points())) {
                        slowed = true;
                        break;
                    }
                }
                double stepCost = stepLen * (slowed ? 2 : 1);
                if (cost + stepCost > budget + 1e-6) {
                    double frac = (budget - cost) / stepCost;
                    Vec stop = prev.lerp(q, Math.max(0, frac));
                    length += prev.dist(stop);
                    cost = budget;
                    path.add(stop);
                    stoppedBy = new MovePlan.Block("BUDGET", null);
                    break outer;
                }
                cost += stepCost;
                length += stepLen;
                prev = q;
            }
            path.add(segEnd);
            cur = segEnd;
            if (contactEnemy != null) {
                engagedWith = contactEnemy;
                stoppedBy = new MovePlan.Block("ENEMY", contactEnemy);
                break;
            }
            if (block != null) {
                stoppedBy = block;
                break;
            }
        }

        Vec end = path.get(path.size() - 1);
        String ally = null;
        for (Piece x : table.pieces()) {
            if (x.side() == p.side() && !x.id().equals(p.id()) && !x.in("DEAD")
                    && x.pos().dist(end) < box.r() + box(x).r() - 1e-6) {
                ally = x.id();
                break;
            }
        }
        return new MovePlan(simplify(path), round3(cost), round3(length), budget, stoppedBy, engagedWith, ally);
    }

    static double firstFailure(Vec a, Vec b, java.util.function.Predicate<Vec> ok) {
        int n = Math.max(2, (int) Math.ceil(a.dist(b) / 0.02));
        double lo = 0;
        for (int i = 1; i <= n; i++) {
            double t = (double) i / n;
            if (!ok.test(a.lerp(b, t))) {
                double hi = t;
                for (int k = 0; k < 30; k++) {
                    double m = (lo + hi) / 2;
                    if (ok.test(a.lerp(b, m))) {
                        lo = m;
                    } else {
                        hi = m;
                    }
                }
                return lo;
            }
            lo = t;
        }
        return 1;
    }

    static List<Vec> simplify(List<Vec> path) {
        List<Vec> out = new ArrayList<>();
        for (Vec q : path) {
            if (out.isEmpty() || out.get(out.size() - 1).dist(q) > 1e-6) {
                out.add(q);
            }
        }
        return out;
    }

    static double round3(double x) {
        return Math.round(x * 1000) / 1000.0;
    }

    /** Distance between models = closest points of their hitboxes. */
    public static double modelDistance(Piece a, Piece b) {
        return Math.max(0, a.pos().dist(b.pos()) - box(a).r() - box(b).r());
    }

    // ---------- line of sight ----------

    public static boolean hasFullArc(Piece p, boolean moving) {
        return moving || p.has("VIGILANCE") || p.in("FLYING") || p.in("SHROUDED");
    }

    public static boolean targetInFrontArc(Piece obs, Piece target, boolean moving) {
        if (hasFullArc(obs, moving)) {
            return true;
        }
        return target.pos().minus(obs.pos()).dot(Vec.fromAngle(obs.facing())) + box(target).r() >= -EPS;
    }

    static List<Vec> observerPoints(Piece obs, boolean fullArc) {
        double r = box(obs).r();
        List<Vec> pts = new ArrayList<>(List.of(obs.pos()));
        int n = fullArc ? ARC_SAMPLES * 2 : ARC_SAMPLES;
        for (int i = 0; i < n; i++) {
            double a = fullArc ? 360.0 * i / n : obs.facing() - 90 + 180.0 * i / (n - 1);
            pts.add(obs.pos().plus(Vec.fromAngle(a).times(r * 0.98)));
        }
        return pts;
    }

    static List<Vec> targetPoints(Piece t) {
        double r = box(t).r();
        List<Vec> pts = new ArrayList<>(List.of(t.pos()));
        for (int i = 0; i < TARGET_SAMPLES; i++) {
            pts.add(t.pos().plus(Vec.fromAngle(360.0 * i / TARGET_SAMPLES).times(r * 0.98)));
        }
        return pts;
    }

    /** "BLOCKED", "FOREST" or null for a clear 3D segment. */
    public static String rayBlocked(Table table, Vec a, double za, Vec b, double zb, Collection<String> ignore) {
        int forests = 0;
        for (Terrain t : table.terrain()) {
            List<double[]> ivs = insideIntervals(a, b, t.points());
            if (ivs.isEmpty()) {
                continue;
            }
            if (t.envs().contains(Env.FOREST)) {
                forests++;
            }
            if (t.height() <= EPS) {
                continue;
            }
            for (double[] iv : ivs) {
                if (Math.min(za + (zb - za) * iv[0], za + (zb - za) * iv[1]) < t.height() - EPS) {
                    return "BLOCKED";
                }
            }
        }
        if (forests >= 2) {
            return "FOREST";
        }
        for (Piece p : table.pieces()) {
            if (ignore.contains(p.id()) || p.in("DEAD") || p.in("FLYING")) {
                continue;
            }
            Hitbox bx = box(p);
            double[] iv = circleInterval(a, b, p.pos(), bx.r());
            if (iv != null && Math.min(za + (zb - za) * iv[0], za + (zb - za) * iv[1]) < bx.h() - EPS) {
                return "BLOCKED";
            }
        }
        return null;
    }

    public static Los lineOfSight(Table table, String obsId, String targetId, boolean moving) {
        Piece obs = table.piece(obsId), tgt = table.piece(targetId);
        if (obsId.equals(targetId)) {
            return new Los(targetId, true, true, null);
        }
        if (obs.in("BLINDED")) {
            return new Los(targetId, false, false, "BLINDED");
        }
        boolean front = targetInFrontArc(obs, tgt, moving);
        if (!front) {
            return new Los(targetId, false, false, "BACK_ARC");
        }
        if (obs.in("FLYING") || tgt.in("FLYING")) {
            return new Los(targetId, true, true, null);
        }
        boolean inDark = table.terrain().stream().anyMatch(t -> t.envs().contains(Env.DARK)
                && circleTouchesPolygon(obs.pos(), box(obs).r(), t.points()));
        if (inDark && !"COALITION_OF_THENION".equals(obs.faction()) && !survives(obs, Env.DARK)
                && modelDistance(obs, tgt) > obs.ag() + EPS) {
            return new Los(targetId, false, true, "DARK");
        }
        Hitbox ob = box(obs), tb = box(tgt);
        boolean full = hasFullArc(obs, moving);
        Vec fv = Vec.fromAngle(obs.facing());
        String reason = "BLOCKED";
        List<String> ignore = List.of(obs.id(), tgt.id());
        for (Vec a : observerPoints(obs, full)) {
            for (Vec b : targetPoints(tgt)) {
                if (!full && b.minus(obs.pos()).dot(fv) < -EPS) {
                    continue;
                }
                for (double fa : Z_FRACTIONS) {
                    for (double fb : Z_FRACTIONS) {
                        String r = rayBlocked(table, a, ob.h() * fa, b, tb.h() * fb, ignore);
                        if (r == null) {
                            return new Los(targetId, true, true, null);
                        }
                        if (r.equals("FOREST")) {
                            reason = "FOREST";
                        }
                    }
                }
            }
        }
        return new Los(targetId, false, true, reason);
    }

    public record Los(String targetId, boolean visible, boolean inFrontArc, String reason) {
    }
}
