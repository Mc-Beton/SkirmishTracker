package com.skirmishchronicle.pairing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.pairing.PairingModels.NoValidPairingException;
import com.skirmishchronicle.pairing.PairingModels.Pair;
import com.skirmishchronicle.pairing.PairingModels.Player;
import com.skirmishchronicle.pairing.PairingModels.Result;
import com.skirmishchronicle.pairing.PairingModels.SoftPreferences;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SwissPairerTest {

    /** Mutable tournament state for simulations. */
    static final class Sim {
        final UUID id = UUID.randomUUID();
        int wins;
        int big;
        int small;
        boolean hadBye;
        final Set<UUID> opponents = new HashSet<>();
        String club;
        String city;
        Integer elo;

        Player toPlayer() {
            return new Player(id, wins, big, small, Set.copyOf(opponents), hadBye, club, null, city, elo);
        }
    }

    private static List<Player> players(List<Sim> sims) {
        return sims.stream().map(Sim::toPlayer).toList();
    }

    private static void assertValid(Result r, List<Sim> sims) {
        Set<UUID> seen = new HashSet<>();
        Map<UUID, Sim> byId = new HashMap<>();
        sims.forEach(s -> byId.put(s.id, s));
        for (Pair p : r.pairs()) {
            assertTrue(seen.add(p.playerA()), "player paired twice");
            assertTrue(seen.add(p.playerB()), "player paired twice");
            assertTrue(!byId.get(p.playerA()).opponents.contains(p.playerB()), "rematch");
        }
        if (r.bye() != null) {
            assertTrue(seen.add(r.bye()), "bye player also paired");
            assertTrue(!byId.get(r.bye()).hadBye, "second bye");
        }
        assertEquals(sims.size(), seen.size(), "everyone plays exactly once per round");
        assertEquals(sims.size() % 2 == 1, r.bye() != null, "bye iff odd");
    }

    private static void play(Result r, List<Sim> sims, Random random) {
        Map<UUID, Sim> byId = new HashMap<>();
        sims.forEach(s -> byId.put(s.id, s));
        for (Pair p : r.pairs()) {
            Sim a = byId.get(p.playerA());
            Sim b = byId.get(p.playerB());
            a.opponents.add(b.id);
            b.opponents.add(a.id);
            int sa = random.nextInt(11);
            int sb = random.nextInt(11);
            a.small += sa;
            b.small += sb;
            if (sa > sb) {
                a.wins++;
                a.big += 3;
            } else if (sb > sa) {
                b.wins++;
                b.big += 3;
            } else {
                a.big += 1;
                b.big += 1;
            }
        }
        if (r.bye() != null) {
            Sim s = byId.get(r.bye());
            s.hadBye = true;
            s.wins++;
            s.big += 3;
        }
    }

    private static List<Sim> field(int n) {
        List<Sim> sims = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            sims.add(new Sim());
        }
        return sims;
    }

    @Test
    void simulatedTournamentsNeverBreakHardRules() {
        Random random = new Random(7);
        for (int n = 4; n <= 40; n++) {
            for (int rep = 0; rep < 5; rep++) {
                List<Sim> sims = field(n);
                SwissPairer pairer = new SwissPairer(random);
                int rounds = Math.min(5, n - 1);
                Result first = pairer.pairFirstRound(players(sims), FirstRoundMode.RANDOM, List.of(),
                        SoftPreferences.NONE);
                assertValid(first, sims);
                play(first, sims, random);
                for (int round = 2; round <= rounds; round++) {
                    Result r = pairer.pairRound(players(sims), SoftPreferences.NONE, rounds - round);
                    assertValid(r, sims);
                    play(r, sims, random);
                }
            }
        }
    }

    @Test
    void lookaheadAvoidsDeadEndsInFullRoundRobin() {
        // 6 players, 5 rounds = everyone meets everyone; round-by-round pairing can dead-end without lookahead.
        Random random = new Random(21);
        for (int rep = 0; rep < 200; rep++) {
            List<Sim> sims = field(6);
            SwissPairer pairer = new SwissPairer(random);
            play(pairer.pairFirstRound(players(sims), FirstRoundMode.RANDOM, List.of(), SoftPreferences.NONE),
                    sims, random);
            for (int round = 2; round <= 5; round++) {
                Result r = pairer.pairRound(players(sims), SoftPreferences.NONE, 5 - round);
                assertValid(r, sims);
                play(r, sims, random);
            }
        }
    }

    @Test
    void pairsPlayersWithEqualWinsWheneverPossible() {
        // 8 players after round 1: four with 1 win, four with 0; nobody has met yet within groups.
        List<Sim> sims = field(8);
        for (int i = 0; i < 4; i++) {
            sims.get(i).wins = 1;
            sims.get(i).big = 3;
            sims.get(i).opponents.add(sims.get(i + 4).id);
            sims.get(i + 4).opponents.add(sims.get(i).id);
        }
        Result r = new SwissPairer(new Random(1)).pairRound(players(sims), SoftPreferences.NONE);
        Map<UUID, Integer> wins = new HashMap<>();
        sims.forEach(s -> wins.put(s.id, s.wins));
        for (Pair p : r.pairs()) {
            assertEquals(wins.get(p.playerA()), wins.get(p.playerB()));
        }
    }

    @Test
    void neighboursInStandingsMeet() {
        List<Sim> sims = field(4);
        int[] big = {9, 7, 5, 3};
        for (int i = 0; i < 4; i++) {
            sims.get(i).big = big[i];
        }
        Result r = new SwissPairer(new Random(3)).pairRound(players(sims), SoftPreferences.NONE);
        Set<Set<UUID>> got = new HashSet<>();
        r.pairs().forEach(p -> got.add(Set.of(p.playerA(), p.playerB())));
        assertTrue(got.contains(Set.of(sims.get(0).id, sims.get(1).id)));
        assertTrue(got.contains(Set.of(sims.get(2).id, sims.get(3).id)));
    }

    @Test
    void leadersMeetWhenAWinnerHasToFloatDown() {
        // Three winners, three losers after round 1 (0-5, 1-4, 2-3). One winner must float: the 3rd one,
        // so that 1st and 2nd play each other (not 1st vs a loser and 2nd vs 3rd).
        for (int seed = 0; seed < 30; seed++) {
            List<Sim> sims = field(6);
            for (int i = 0; i < 6; i++) {
                sims.get(i).wins = i < 3 ? 1 : 0;
                sims.get(i).big = 10 - i;
            }
            int[][] played = {{0, 5}, {1, 4}, {2, 3}};
            for (int[] g : played) {
                sims.get(g[0]).opponents.add(sims.get(g[1]).id);
                sims.get(g[1]).opponents.add(sims.get(g[0]).id);
            }
            Result r = new SwissPairer(new Random(seed)).pairRound(players(sims), SoftPreferences.NONE);
            boolean leaders = r.pairs().stream().anyMatch(p ->
                    Set.of(p.playerA(), p.playerB()).equals(Set.of(sims.get(0).id, sims.get(1).id)));
            assertTrue(leaders, "1st vs 2nd, seed " + seed);
        }
    }

    @Test
    void byeGoesToLowestRankedWithoutPreviousBye() {
        List<Sim> sims = field(5);
        for (int i = 0; i < 5; i++) {
            sims.get(i).big = 10 - i;  // index 4 is last
        }
        sims.get(4).hadBye = true;
        Result r = new SwissPairer(new Random(5)).pairRound(players(sims), SoftPreferences.NONE);
        assertEquals(sims.get(3).id, r.bye());
    }

    @Test
    void clubPreferenceSwapsOpponentWithinSameWinGroupOnly() {
        List<Sim> sims = field(4);
        // All with 1 win; 0 and 1 are neighbours but share a club.
        for (int i = 0; i < 4; i++) {
            sims.get(i).wins = 1;
            sims.get(i).big = 10 - i;
        }
        sims.get(0).club = "Gildia Kraków";
        sims.get(1).club = "gildia kraków ";
        Result r = new SwissPairer(new Random(9)).pairRound(players(sims),
                new SoftPreferences(true, false, false));
        for (Pair p : r.pairs()) {
            assertTrue(!Set.of(p.playerA(), p.playerB()).equals(Set.of(sims.get(0).id, sims.get(1).id)));
        }

        // Different win groups: the preference must NOT move anyone across groups.
        List<Sim> split = field(4);
        split.get(0).wins = 1;
        split.get(1).wins = 1;
        split.get(0).club = "A";
        split.get(1).club = "A";
        Result r2 = new SwissPairer(new Random(9)).pairRound(players(split),
                new SoftPreferences(true, false, false));
        Set<Set<UUID>> got = new HashSet<>();
        r2.pairs().forEach(p -> got.add(Set.of(p.playerA(), p.playerB())));
        assertTrue(got.contains(Set.of(split.get(0).id, split.get(1).id)));
    }

    @Test
    void clubOutranksCity() {
        List<Sim> sims = field(4);
        sims.get(0).club = "X";
        sims.get(1).club = "X";
        sims.get(0).city = "Łódź";
        sims.get(2).city = "Łódź";
        sims.get(1).city = "Łódź";
        sims.get(3).city = "Łódź";
        // Every pairing shares a city; only avoiding the club matters.
        Result r = new SwissPairer(new Random(2)).pairRound(players(sims), new SoftPreferences(true, false, true));
        for (Pair p : r.pairs()) {
            assertTrue(!Set.of(p.playerA(), p.playerB()).equals(Set.of(sims.get(0).id, sims.get(1).id)));
        }
    }

    @Test
    void failsLoudlyWhenNoPairingExists() {
        List<Sim> sims = field(4);
        // Everyone already played everyone.
        for (Sim a : sims) {
            for (Sim b : sims) {
                if (a != b) {
                    a.opponents.add(b.id);
                }
            }
        }
        assertThrows(NoValidPairingException.class,
                () -> new SwissPairer(new Random(1)).pairRound(players(sims), SoftPreferences.NONE));
    }

    @Test
    void firstRoundKeepsFixedPairsAndHandlesBye() {
        List<Sim> sims = field(7);
        Pair fixed = new Pair(sims.get(0).id, sims.get(1).id);
        Result r = new SwissPairer(new Random(4)).pairFirstRound(players(sims), FirstRoundMode.RANDOM,
                List.of(fixed), SoftPreferences.NONE);
        assertValid(r, sims);
        assertTrue(r.pairs().contains(fixed));
        assertNotNull(r.bye());
        assertTrue(!r.bye().equals(sims.get(0).id) && !r.bye().equals(sims.get(1).id));
    }

    @Test
    void eloTopVsBottomPairsHalves() {
        List<Sim> sims = field(8);
        for (int i = 0; i < 8; i++) {
            sims.get(i).elo = 2000 - i * 50;  // index 0 strongest
        }
        Result r = new SwissPairer(new Random(6)).pairFirstRound(players(sims), FirstRoundMode.ELO_TOP_VS_BOTTOM,
                List.of(), SoftPreferences.NONE);
        Set<Set<UUID>> got = new HashSet<>();
        r.pairs().forEach(p -> got.add(Set.of(p.playerA(), p.playerB())));
        for (int i = 0; i < 4; i++) {
            assertTrue(got.contains(Set.of(sims.get(i).id, sims.get(i + 4).id)), "expected " + i + " v " + (i + 4));
        }
        assertNull(r.bye());
    }

    @Test
    void eloStrongVsStrongPairsNeighbours() {
        List<Sim> sims = field(6);
        for (int i = 0; i < 6; i++) {
            sims.get(i).elo = 1800 - i * 20;
        }
        Result r = new SwissPairer(new Random(8)).pairFirstRound(players(sims),
                FirstRoundMode.ELO_STRONG_VS_STRONG, List.of(), SoftPreferences.NONE);
        Set<Set<UUID>> got = new HashSet<>();
        r.pairs().forEach(p -> got.add(Set.of(p.playerA(), p.playerB())));
        for (int i = 0; i < 6; i += 2) {
            assertTrue(got.contains(Set.of(sims.get(i).id, sims.get(i + 1).id)));
        }
    }

    @Test
    void eloByeGoesToWeakerHalf() {
        for (int seed = 0; seed < 50; seed++) {
            List<Sim> sims = field(9);
            for (int i = 0; i < 9; i++) {
                sims.get(i).elo = 2000 - i * 10;
            }
            Result r = new SwissPairer(new Random(seed)).pairFirstRound(players(sims),
                    FirstRoundMode.ELO_TOP_VS_BOTTOM, List.of(), SoftPreferences.NONE);
            int idx = -1;
            for (int i = 0; i < 9; i++) {
                if (sims.get(i).id.equals(r.bye())) {
                    idx = i;
                }
            }
            assertTrue(idx >= 4, "bye must be in the weaker half, got index " + idx);
        }
    }

    @Test
    void randomFirstRoundAvoidsSameClubWhenEnabled() {
        for (int seed = 0; seed < 30; seed++) {
            List<Sim> sims = field(6);
            sims.get(0).club = "A";
            sims.get(1).club = "A";
            sims.get(2).club = "B";
            sims.get(3).club = "B";
            Result r = new SwissPairer(new Random(seed)).pairFirstRound(players(sims), FirstRoundMode.RANDOM,
                    List.of(), new SoftPreferences(true, false, false));
            for (Pair p : r.pairs()) {
                Set<UUID> pair = Set.of(p.playerA(), p.playerB());
                assertTrue(!pair.equals(Set.of(sims.get(0).id, sims.get(1).id)));
                assertTrue(!pair.equals(Set.of(sims.get(2).id, sims.get(3).id)));
            }
        }
    }

    @Test
    void largeFieldIsFast() {
        List<Sim> sims = field(256);
        Random random = new Random(11);
        SwissPairer pairer = new SwissPairer(random);
        play(pairer.pairFirstRound(players(sims), FirstRoundMode.RANDOM, List.of(), SoftPreferences.NONE), sims, random);
        long start = System.nanoTime();
        for (int round = 2; round <= 6; round++) {
            Result r = pairer.pairRound(players(sims), new SoftPreferences(true, true, true));
            assertValid(r, sims);
            play(r, sims, random);
        }
        long ms = (System.nanoTime() - start) / 1_000_000;
        assertTrue(ms < 20_000, "5 rounds for 256 players took " + ms + " ms");
    }
}
