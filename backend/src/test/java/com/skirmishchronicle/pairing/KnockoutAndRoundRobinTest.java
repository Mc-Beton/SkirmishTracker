package com.skirmishchronicle.pairing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class KnockoutAndRoundRobinTest {

    private static List<UUID> players(int n) {
        List<UUID> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            list.add(UUID.randomUUID());
        }
        return list;
    }

    @Test
    void seedOrderKeepsTopSeedsApart() {
        assertEquals(List.of(1, 2), KnockoutBracket.seedOrder(2));
        assertEquals(List.of(1, 4, 2, 3), KnockoutBracket.seedOrder(4));
        assertEquals(List.of(1, 8, 4, 5, 2, 7, 3, 6), KnockoutBracket.seedOrder(8));
        assertEquals(3, KnockoutBracket.rounds(5), "rounds for 5");
        assertEquals(4, KnockoutBracket.rounds(16), "rounds for 16");
    }

    @Test
    void topSeedsGetByesWhenBracketIsNotFull() {
        List<UUID> p = players(6);
        List<KnockoutBracket.Match> r1 = KnockoutBracket.firstRound(p);
        assertEquals(4, r1.size(), "matches");
        // Seeds 1 and 2 have no opponent (slots of seeds 8 and 7).
        long byes = r1.stream().filter(m -> m.b() == null).count();
        assertEquals(2L, byes, "byes");
        assertTrue(r1.stream().filter(m -> m.b() == null).allMatch(m -> m.a().seed() <= 2));
        // Higher seed is always listed first.
        assertTrue(r1.stream().filter(m -> m.b() != null).allMatch(m -> m.a().seed() < m.b().seed()));
    }

    @Test
    void fullBracketPlaysDownToOneChampionAndHigherSeedWinsDraws() {
        List<UUID> p = players(8);
        List<KnockoutBracket.Match> round = KnockoutBracket.firstRound(p);
        int rounds = 0;
        UUID champion = null;
        while (!round.isEmpty()) {
            rounds++;
            List<KnockoutBracket.Played> played = new ArrayList<>();
            for (KnockoutBracket.Match m : round) {
                // Every game is a draw: the better seed must advance.
                UUID w = KnockoutBracket.winner(m.a(), m.b(), 5, 5);
                played.add(new KnockoutBracket.Played(m.slot(), m.a(), m.b(), w));
            }
            if (round.size() == 1) {
                champion = played.get(0).winner();
            }
            round = KnockoutBracket.nextRound(played);
        }
        assertEquals(3, rounds, "rounds");
        assertEquals(p.get(0), champion);
    }

    @Test
    void upsetsPropagateToTheRightSlot() {
        List<UUID> p = players(4);
        List<KnockoutBracket.Match> r1 = KnockoutBracket.firstRound(p);  // 1-4, 2-3
        List<KnockoutBracket.Played> played = new ArrayList<>();
        for (KnockoutBracket.Match m : r1) {
            UUID w = KnockoutBracket.winner(m.a(), m.b(), 2, 8);  // lower seed wins every game
            played.add(new KnockoutBracket.Played(m.slot(), m.a(), m.b(), w));
        }
        List<KnockoutBracket.Match> fin = KnockoutBracket.nextRound(played);
        assertEquals(1, fin.size(), "final");
        assertEquals(3, fin.get(0).a().seed(), "seed 3 listed first");
        assertEquals(4, fin.get(0).b().seed(), "seed 4");
        assertEquals("FINAL", KnockoutBracket.stage(1));
        assertEquals("ROUND_OF_16", KnockoutBracket.stage(8));
    }

    @Test
    void roundRobinEveryoneMeetsEveryoneOnce() {
        for (int n = 2; n <= 9; n++) {
            List<UUID> p = players(n);
            Map<UUID, Set<UUID>> met = new HashMap<>();
            Map<UUID, Integer> byes = new HashMap<>();
            int rounds = RoundRobinSchedule.rounds(n);
            for (int r = 0; r < rounds; r++) {
                Set<UUID> seen = new HashSet<>();
                for (PairingModels.Pair pair : RoundRobinSchedule.round(p, r)) {
                    assertTrue(seen.add(pair.playerA()), "twice in one round");
                    if (pair.playerB() == null) {
                        byes.merge(pair.playerA(), 1, Integer::sum);
                        continue;
                    }
                    assertTrue(seen.add(pair.playerB()), "twice in one round");
                    assertTrue(met.computeIfAbsent(pair.playerA(), k -> new HashSet<>()).add(pair.playerB()), "rematch");
                    assertTrue(met.computeIfAbsent(pair.playerB(), k -> new HashSet<>()).add(pair.playerA()), "rematch");
                }
                assertEquals((long) n, (long) seen.size(), "everybody plays or rests");
            }
            for (UUID id : p) {
                assertEquals((long) n - 1, (long) met.getOrDefault(id, Set.of()).size(), "opponents n=" + n);
                if (n % 2 == 1) {
                    assertEquals(1, byes.get(id));
                } else {
                    assertNull(byes.get(id));
                }
            }
        }
    }
}
