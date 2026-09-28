package com.skirmishchronicle.pairing;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.pairing.PairingModels.NoValidPairingException;
import com.skirmishchronicle.pairing.PairingModels.Pair;
import com.skirmishchronicle.pairing.PairingModels.Player;
import com.skirmishchronicle.pairing.PairingModels.Result;
import com.skirmishchronicle.pairing.PairingModels.SoftPreferences;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Swiss pairing as a minimum-cost perfect matching.
 *
 * <p>Hard rules (edges that do not exist): no rematches, at most one BYE per player.
 * Costs are lexicographic, each level strictly dominating everything below it:
 * <ol>
 *   <li>difference in wins (players meet opponents with the same number of wins whenever possible),</li>
 *   <li>soft preferences: same club, then same faction, then same city,</li>
 *   <li>distance in the standings (wins → big points → small points), squared, so neighbours meet.</li>
 * </ol>
 * A soft preference can therefore swap an opponent for another one with the same number of wins,
 * but never for one with a different number of wins.
 */
public final class SwissPairer {

    private final Random random;

    public SwissPairer(Random random) {
        this.random = random;
    }

    /** Standings order used for pairing: wins, then big points, then small points; ties broken randomly. */
    public List<Player> standingsOrder(List<Player> players) {
        List<Player> shuffled = new ArrayList<>(players);
        Collections.shuffle(shuffled, random);
        shuffled.sort(Comparator.comparingInt(Player::wins).reversed()
                .thenComparing(Comparator.comparingInt(Player::bigPoints).reversed())
                .thenComparing(Comparator.comparingInt(Player::smallPoints).reversed()));
        return shuffled;
    }

    // ------------------------------------------------------------------ rounds 2+

    public Result pairRound(List<Player> players, SoftPreferences prefs) {
        return pairRound(players, prefs, 0);
    }

    /**
     * @param roundsAfterThis rounds still to be played after this one. When positive, the engine checks that
     *                        the next round will still be pairable and, if not, looks for another pairing of
     *                        this round (small fields near the round-robin limit can otherwise dead-end).
     */
    public Result pairRound(List<Player> players, SoftPreferences prefs, int roundsAfterThis) {
        List<Player> order = standingsOrder(players);
        int n = order.size();
        if (n < 2) {
            throw new NoValidPairingException("NOT_ENOUGH_PLAYERS");
        }
        Set<Long> penalized = new HashSet<>();
        Result first = null;
        for (int attempt = 0; attempt < 25; attempt++) {
            Result r = pairOnce(order, prefs, penalized);
            if (first == null) {
                first = r;
            }
            if (roundsAfterThis <= 0 || nextRoundPairable(order, r)) {
                return r;
            }
            // Discourage this round's pairs and try again.
            Map<UUID, Integer> index = new java.util.HashMap<>();
            for (int i = 0; i < n; i++) {
                index.put(order.get(i).id(), i);
            }
            for (Pair p : r.pairs()) {
                int a = index.get(p.playerA());
                int b = index.get(p.playerB());
                penalized.add(key(Math.min(a, b), Math.max(a, b)));
            }
            if (r.bye() != null) {
                penalized.add(key(index.get(r.bye()), n));
            }
        }
        return first;
    }

    private static long key(int a, int b) {
        return ((long) a << 32) | b;
    }

    private Result pairOnce(List<Player> order, SoftPreferences prefs, Set<Long> penalized) {
        int n = order.size();
        boolean odd = n % 2 == 1;
        int vertices = odd ? n + 1 : n;
        int pairs = vertices / 2;
        Levels lv = new Levels(pairs, n);
        long penalty = lv.wins * 2;  // like an extra float, still below any hard rule
        int minWins = order.stream().mapToInt(Player::wins).min().orElse(0);

        List<long[]> edges = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                Player a = order.get(i);
                Player b = order.get(j);
                if (a.previousOpponents().contains(b.id()) || b.previousOpponents().contains(a.id())) {
                    continue;
                }
                long dw = a.wins() - b.wins();
                long cost = lv.wins * dw * dw + softCost(a, b, prefs, lv) + rankCost(j - i, n);
                if (dw != 0) {
                    // The player who floats down should be the lowest-ranked one of the higher group.
                    cost += lv.floatRank * (n - Math.min(i, j));
                }
                if (penalized.contains(key(i, j))) {
                    cost += penalty;
                }
                edges.add(new long[] {i, j, cost});
            }
        }
        if (odd) {
            int bye = n;
            for (int i = 0; i < n; i++) {
                Player p = order.get(i);
                if (p.hadBye()) {
                    continue;
                }
                long dw = p.wins() - minWins;
                // Lowest win group first, and within it the lowest-ranked player.
                long cost = lv.wins * dw * dw + (n - 1 - i) * lv.byeRank;
                if (penalized.contains(key(i, bye))) {
                    cost += penalty;
                }
                edges.add(new long[] {i, bye, cost});
            }
        }
        int[] mate = solveMinCost(vertices, edges);
        return toResult(mate, order, odd ? n : -1);
    }

    /** True if, after playing result r, a valid (no rematch, one bye per player) next round exists. */
    private static boolean nextRoundPairable(List<Player> order, Result r) {
        int n = order.size();
        Map<UUID, Integer> index = new java.util.HashMap<>();
        for (int i = 0; i < n; i++) {
            index.put(order.get(i).id(), i);
        }
        Set<Long> played = new HashSet<>();
        for (int i = 0; i < n; i++) {
            for (UUID o : order.get(i).previousOpponents()) {
                Integer j = index.get(o);
                if (j != null) {
                    played.add(key(Math.min(i, j), Math.max(i, j)));
                }
            }
        }
        for (Pair p : r.pairs()) {
            int a = index.get(p.playerA());
            int b = index.get(p.playerB());
            played.add(key(Math.min(a, b), Math.max(a, b)));
        }
        boolean odd = n % 2 == 1;
        List<Integer> ei = new ArrayList<>();
        List<Integer> ej = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (!played.contains(key(i, j))) {
                    ei.add(i);
                    ej.add(j);
                }
            }
            boolean hadBye = order.get(i).hadBye() || order.get(i).id().equals(r.bye());
            if (odd && !hadBye) {
                ei.add(i);
                ej.add(n);
            }
        }
        int vertices = odd ? n + 1 : n;
        long[] w = new long[ei.size()];
        java.util.Arrays.fill(w, 1);
        int[] mate = MaxWeightMatching.solve(vertices, ei.stream().mapToInt(Integer::intValue).toArray(),
                ej.stream().mapToInt(Integer::intValue).toArray(), w, true);
        for (int v = 0; v < vertices; v++) {
            if (mate[v] < 0) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------ rounds 2+: random / ELO

    /**
     * Pairing that ignores the results: random or by ELO, as in round 1, but still with the hard rules (no
     * rematches, at most one BYE per player). Soft preferences are the only other cost.
     */
    public Result pairIgnoringResults(List<Player> players, FirstRoundMode mode, SoftPreferences prefs) {
        List<Player> order = new ArrayList<>(players);
        Collections.shuffle(order, random);
        if (mode != FirstRoundMode.RANDOM) {
            order.sort(Comparator.comparingInt((Player p) -> p.elo() == null ? 1500 : p.elo()).reversed());
        }
        int n = order.size();
        if (n < 2) {
            throw new NoValidPairingException("NOT_ENOUGH_PLAYERS");
        }
        boolean odd = n % 2 == 1;
        int vertices = odd ? n + 1 : n;
        Levels lv = new Levels(vertices / 2, n);
        int half = n / 2;
        List<long[]> edges = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                Player a = order.get(i);
                Player b = order.get(j);
                if (a.previousOpponents().contains(b.id()) || b.previousOpponents().contains(a.id())) {
                    continue;
                }
                long structure = switch (mode) {
                    case RANDOM -> random.nextInt(n);
                    case ELO_STRONG_VS_STRONG -> j - i;
                    case ELO_TOP_VS_BOTTOM -> Math.abs((j - i) - half);
                };
                edges.add(new long[] {i, j, softCost(a, b, prefs, lv) + structure});
            }
            if (odd && !order.get(i).hadBye()) {
                // Random: anybody without a BYE yet; ELO: preferably the weakest.
                long cost = mode == FirstRoundMode.RANDOM ? random.nextInt(n) : n - 1 - i;
                edges.add(new long[] {i, n, cost});
            }
        }
        int[] mate = solveMinCost(vertices, edges);
        return toResult(mate, order, odd ? n : -1);
    }

    // ------------------------------------------------------------------ round 1

    /**
     * @param fixedPairs accepted challenges and organizer-made pairs; taken as they are
     */
    public Result pairFirstRound(List<Player> players, FirstRoundMode mode, List<Pair> fixedPairs,
                                 SoftPreferences prefs) {
        Set<UUID> fixed = new HashSet<>();
        for (Pair p : fixedPairs) {
            fixed.add(p.playerA());
            fixed.add(p.playerB());
        }
        List<Player> free = new ArrayList<>(players.stream().filter(p -> !fixed.contains(p.id())).toList());
        Collections.shuffle(free, random);
        if (mode != FirstRoundMode.RANDOM) {
            // Strongest first; players without ELO count as a new player (1500).
            free.sort(Comparator.comparingInt((Player p) -> p.elo() == null ? 1500 : p.elo()).reversed());
        }

        UUID bye = null;
        if (free.size() % 2 == 1) {
            int from = mode == FirstRoundMode.RANDOM ? 0 : free.size() / 2;  // ELO: someone from the weaker half
            Player chosen = free.get(from + random.nextInt(free.size() - from));
            bye = chosen.id();
            free.remove(chosen);
        }

        List<Pair> result = new ArrayList<>(fixedPairs);
        int n = free.size();
        if (n == 0) {
            return new Result(result, bye);
        }
        if (mode == FirstRoundMode.RANDOM && !prefs.any()) {
            for (int i = 0; i < n; i += 2) {
                result.add(new Pair(free.get(i).id(), free.get(i + 1).id()));
            }
            return new Result(result, bye);
        }

        Levels lv = new Levels(n / 2, n);
        int half = n / 2;
        List<long[]> edges = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                long structure = switch (mode) {
                    case RANDOM -> random.nextInt(n);                    // random tie-breaker only
                    case ELO_STRONG_VS_STRONG -> j - i;                  // neighbours by ELO
                    case ELO_TOP_VS_BOTTOM -> Math.abs((j - i) - half);  // i meets i + n/2
                };
                edges.add(new long[] {i, j, softCost(free.get(i), free.get(j), prefs, lv) + structure});
            }
        }
        int[] mate = solveMinCost(n, edges);
        for (int i = 0; i < n; i++) {
            if (mate[i] > i) {
                result.add(new Pair(free.get(i).id(), free.get(mate[i]).id()));
            }
        }
        return new Result(result, bye);
    }

    // ------------------------------------------------------------------ internals

    /** Cost weights so that each level outweighs the maximum possible total of all lower levels. */
    /**
     * Cost of pairing players {@code d} places apart in the standings. Squared, so that among pairings with the
     * same number of floats the one keeping neighbours together wins (1st–2nd, 3rd–5th, 4th–6th beats
     * 1st–4th, 2nd–3rd, 5th–6th, although both add up to the same distance). Linear above 64 players to keep
     * the lexicographic cost levels far from overflowing a long.
     */
    static long rankCost(long d, long players) {
        return fine(players) ? d * d : d;
    }

    /** Fields up to 64 players get the finer costs (squared distance, float choice); larger ones stay linear. */
    private static boolean fine(long players) {
        return players <= 64;
    }

    private static final class Levels {
        final long city;
        final long faction;
        final long club;
        final long wins;
        /** One place higher for the BYE outweighs any change in the pairs' standings distance. */
        final long byeRank;
        /** Which player floats down outweighs the standings distance too (0 = not used). */
        final long floatRank;

        Levels(long pairs, long players) {
            long pairsMax = pairs * rankCost(players + 1, players);
            byeRank = fine(players) ? pairsMax + 1 : 1;
            floatRank = fine(players) ? pairsMax + 1 : 0;
            long rankMaxTotal = pairsMax + players * byeRank + pairs * (players + 1) * floatRank;
            city = rankMaxTotal + 1;
            faction = pairs * city + rankMaxTotal + 1;
            club = pairs * (faction + city) + rankMaxTotal + 1;
            wins = pairs * (club + faction + city) + rankMaxTotal + 1;
        }
    }

    private static long softCost(Player a, Player b, SoftPreferences prefs, Levels lv) {
        long cost = 0;
        if (prefs.avoidSameClub() && same(a.club(), b.club())) {
            cost += lv.club;
        }
        if (prefs.avoidSameFaction() && same(a.faction(), b.faction())) {
            cost += lv.faction;
        }
        if (prefs.avoidSameCity() && same(a.city(), b.city())) {
            cost += lv.city;
        }
        return cost;
    }

    private static boolean same(String x, String y) {
        return x != null && y != null && !x.isBlank()
                && x.trim().toLowerCase(Locale.ROOT).equals(y.trim().toLowerCase(Locale.ROOT));
    }

    /** Minimum-cost perfect matching; throws if the hard rules leave no perfect matching. */
    private static int[] solveMinCost(int vertices, List<long[]> edges) {
        long maxCost = 0;
        for (long[] e : edges) {
            maxCost = Math.max(maxCost, e[2]);
        }
        int m = edges.size();
        int[] ei = new int[m];
        int[] ej = new int[m];
        long[] ew = new long[m];
        for (int k = 0; k < m; k++) {
            ei[k] = (int) edges.get(k)[0];
            ej[k] = (int) edges.get(k)[1];
            // Among perfect matchings (max cardinality), max total weight == min total cost.
            ew[k] = maxCost + 1 - edges.get(k)[2];
        }
        int[] mate = MaxWeightMatching.solve(vertices, ei, ej, ew, true);
        for (int v = 0; v < vertices; v++) {
            if (mate[v] < 0) {
                throw new NoValidPairingException("NO_VALID_PAIRING");
            }
        }
        return mate;
    }

    private static Result toResult(int[] mate, List<Player> order, int byeVertex) {
        List<Pair> pairs = new ArrayList<>();
        UUID bye = null;
        for (int i = 0; i < order.size(); i++) {
            int j = mate[i];
            if (j == byeVertex) {
                bye = order.get(i).id();
            } else if (j > i) {
                pairs.add(new Pair(order.get(i).id(), order.get(j).id()));
            }
        }
        return new Result(pairs, bye);
    }

    /** Helper for callers: index players by id. */
    public static Map<UUID, Player> byId(List<Player> players) {
        return players.stream().collect(Collectors.toMap(Player::id, Function.identity()));
    }
}
