package com.skirmishchronicle.pairing;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Round robin by the circle (Berger) method: the first player stays, the others rotate. With an odd number of
 * players a virtual BYE is added, so everybody rests exactly once.
 */
public final class RoundRobinSchedule {

    private RoundRobinSchedule() {
    }

    public static int rounds(int players) {
        return players % 2 == 0 ? players - 1 : players;
    }

    /**
     * Pairs of round {@code roundIndex} (0-based) for players in their fixed schedule order. A pair with
     * {@code playerB == null} is the BYE of that round.
     */
    public static List<PairingModels.Pair> round(List<UUID> players, int roundIndex) {
        if (players.size() < 2) {
            throw new PairingModels.NoValidPairingException("round robin needs at least 2 players");
        }
        List<UUID> list = new ArrayList<>(players);
        if (list.size() % 2 == 1) {
            list.add(null);
        }
        int n = list.size();
        if (roundIndex < 0 || roundIndex >= n - 1) {
            throw new PairingModels.NoValidPairingException("round " + roundIndex + " out of range");
        }
        // Rotate positions 1..n-1 by roundIndex.
        List<UUID> rotated = new ArrayList<>(n);
        rotated.add(list.get(0));
        for (int i = 1; i < n; i++) {
            int from = 1 + Math.floorMod(i - 1 - roundIndex, n - 1);
            rotated.add(list.get(from));
        }
        List<PairingModels.Pair> pairs = new ArrayList<>();
        for (int i = 0; i < n / 2; i++) {
            UUID a = rotated.get(i);
            UUID b = rotated.get(n - 1 - i);
            // Alternate who is listed first so nobody is always "player A".
            boolean swap = (roundIndex + i) % 2 == 1;
            if (a == null) {
                pairs.add(new PairingModels.Pair(b, null));
            } else if (b == null) {
                pairs.add(new PairingModels.Pair(a, null));
            } else {
                pairs.add(swap ? new PairingModels.Pair(b, a) : new PairingModels.Pair(a, b));
            }
        }
        // BYE last (tables are numbered in list order).
        pairs.sort((x, y) -> Boolean.compare(x.playerB() == null, y.playerB() == null));
        return pairs;
    }
}
