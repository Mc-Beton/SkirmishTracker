package com.skirmishchronicle.pairing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.pairing.PairingModels.Pair;
import com.skirmishchronicle.pairing.PairingModels.Player;
import com.skirmishchronicle.pairing.PairingModels.Result;
import com.skirmishchronicle.pairing.PairingModels.SoftPreferences;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PairIgnoringResultsTest {

    @Test
    void randomAndEloModesKeepHardRules() {
        for (FirstRoundMode mode : FirstRoundMode.values()) {
            for (int seed = 0; seed < 200; seed++) {
                Random rnd = new Random(seed);
                List<UUID> ids = new ArrayList<>();
                for (int i = 0; i < 7; i++) {
                    ids.add(UUID.randomUUID());
                }
                // Round 1 already played: 0-1, 2-3, 4-5, 6 had the BYE.
                List<Player> players = new ArrayList<>();
                for (int i = 0; i < 7; i++) {
                    Set<UUID> prev = new HashSet<>();
                    if (i < 6) {
                        prev.add(ids.get(i % 2 == 0 ? i + 1 : i - 1));
                    }
                    players.add(new Player(ids.get(i), 0, 0, 0, prev, i == 6, null, null, null, 1400 + 20 * i));
                }
                Result r = new SwissPairer(rnd).pairIgnoringResults(players, mode, SoftPreferences.NONE);
                assertEquals(3, r.pairs().size(), "pairs");
                assertTrue(r.bye() != null && !r.bye().equals(ids.get(6)), "second BYE for the same player");
                for (Pair p : r.pairs()) {
                    int a = ids.indexOf(p.playerA());
                    int b = ids.indexOf(p.playerB());
                    assertTrue(Math.min(a, b) % 2 != 0 || Math.max(a, b) != Math.min(a, b) + 1 || Math.min(a, b) == 6,
                            "rematch " + a + "-" + b);
                }
            }
        }
    }
}
