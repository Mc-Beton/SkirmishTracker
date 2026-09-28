package com.skirmishchronicle.pairing;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Single-elimination bracket (framework-free). Seeds are 1-based; the bracket size is the next power of two and
 * the missing seeds are BYEs, so the top seeds get a free first round. Standard placement keeps seeds 1 and 2 apart
 * until the final: with 8 slots the first round is 1–8, 4–5, 2–7, 3–6.
 */
public final class KnockoutBracket {

    /** A bracket match: slot = position in the round (0-based). {@code b == null} is a BYE. */
    public record Seeded(UUID player, int seed) {
    }

    public record Match(int slot, Seeded a, Seeded b) {
    }

    /** Result of a finished bracket match. */
    public record Played(int slot, Seeded a, Seeded b, UUID winner) {
        public Seeded winnerSeeded() {
            return b == null || a.player().equals(winner) ? a : b;
        }

        public Seeded loserSeeded() {
            return b == null ? null : a.player().equals(winner) ? b : a;
        }
    }

    private KnockoutBracket() {
    }

    public static int bracketSize(int players) {
        int size = 1;
        while (size < players) {
            size <<= 1;
        }
        return Math.max(size, 2);
    }

    /** Number of knockout rounds for this many players (2 → 1, 5..8 → 3). */
    public static int rounds(int players) {
        return Integer.numberOfTrailingZeros(bracketSize(players));
    }

    /** Seed numbers in bracket order, e.g. size 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
    public static List<Integer> seedOrder(int size) {
        List<Integer> order = new ArrayList<>(List.of(1));
        while (order.size() < size) {
            int next = order.size() * 2 + 1;
            List<Integer> expanded = new ArrayList<>();
            for (int s : order) {
                expanded.add(s);
                expanded.add(next - s);
            }
            order = expanded;
        }
        return order;
    }

    /** First round from players listed in seed order (index 0 = seed 1). */
    public static List<Match> firstRound(List<UUID> seededPlayers) {
        if (seededPlayers.size() < 2) {
            throw new PairingModels.NoValidPairingException("knockout needs at least 2 players");
        }
        int size = bracketSize(seededPlayers.size());
        List<Integer> order = seedOrder(size);
        List<Match> matches = new ArrayList<>();
        for (int i = 0; i < size; i += 2) {
            Seeded x = seeded(seededPlayers, order.get(i));
            Seeded y = seeded(seededPlayers, order.get(i + 1));
            if (x == null && y == null) {
                continue;  // cannot happen with size < 2 * players, kept for safety
            }
            if (x == null || (y != null && y.seed() < x.seed())) {
                Seeded tmp = x;
                x = y;
                y = tmp;
            }
            matches.add(new Match(i / 2, x, y));
        }
        return matches;
    }

    /**
     * Next round: winners of slots 2k and 2k+1 meet in slot k. {@code previous} must contain every match of the
     * previous round. Returns an empty list when the previous round was the final.
     */
    public static List<Match> nextRound(List<Played> previous) {
        if (previous.size() <= 1) {
            return List.of();
        }
        int maxSlot = previous.stream().mapToInt(Played::slot).max().orElse(0);
        Seeded[] winners = new Seeded[maxSlot + 2];
        for (Played p : previous) {
            winners[p.slot()] = p.winnerSeeded();
        }
        List<Match> next = new ArrayList<>();
        for (int k = 0; 2 * k <= maxSlot; k++) {
            Seeded x = winners[2 * k];
            Seeded y = 2 * k + 1 < winners.length ? winners[2 * k + 1] : null;
            if (x == null && y == null) {
                continue;
            }
            if (x == null || (y != null && y.seed() < x.seed())) {
                Seeded tmp = x;
                x = y;
                y = tmp;
            }
            next.add(new Match(k, x, y));
        }
        return next;
    }

    /**
     * Winner of a finished game: more small points wins; on equal small points the higher seed (lower number)
     * advances. BYE: the only player.
     */
    public static UUID winner(Seeded a, Seeded b, int smallA, int smallB) {
        if (b == null) {
            return a.player();
        }
        if (smallA != smallB) {
            return smallA > smallB ? a.player() : b.player();
        }
        return a.seed() <= b.seed() ? a.player() : b.player();
    }

    /** Label of a knockout round by the number of players still in it: 2 → final, 4 → semifinal, … */
    public static String stage(int matchesInRound) {
        return switch (matchesInRound) {
            case 1 -> "FINAL";
            case 2 -> "SEMIFINAL";
            case 4 -> "QUARTERFINAL";
            default -> "ROUND_OF_" + (matchesInRound * 2);
        };
    }

    private static Seeded seeded(List<UUID> players, int seed) {
        return seed <= players.size() ? new Seeded(players.get(seed - 1), seed) : null;
    }
}
