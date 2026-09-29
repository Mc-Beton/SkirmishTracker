package com.skirmishchronicle.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MetaStatsTest {

    private static final LocalDate DAY = LocalDate.of(2026, 5, 10);

    private static List<UUID> players(int n) {
        List<UUID> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(UUID.randomUUID());
        }
        return out;
    }

    /** Both sides of one game; scoreA 1 / 0.5 / 0. */
    private static void game(List<SideFact> out, UUID a, UUID b, String fa, String fb, double eloA, double eloB,
                             double scoreA, LocalDate day, Set<String> unitsA, String mission) {
        UUID id = UUID.randomUUID();
        int va = scoreA == 1 ? 8 : scoreA == 0 ? 3 : 5;
        int vb = scoreA == 1 ? 3 : scoreA == 0 ? 8 : 5;
        out.add(new SideFact(id, a, b, day, SideFact.Source.OWN, null, null, null, fa, fb, unitsA, mission, eloA, eloB,
                scoreA, va, vb));
        out.add(new SideFact(id, b, a, day, SideFact.Source.OWN, null, null, null, fb, fa, Set.of(), mission, eloB,
                eloA, 1 - scoreA, vb, va));
    }

    @Test
    void wilsonIntervalMatchesReferenceValues() {
        double[] ci = MetaStats.wilson(0.5, 100);
        assertEquals(0.4038, ci[0], 0.0005);
        assertEquals(0.5962, ci[1], 0.0005);
    }

    @Test
    void performanceSeparatesStrongFactionFromStrongPlayers() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> strong = players(6);
        List<UUID> average = players(6);
        List<UUID> others = players(6);
        // ONI: strong players (1700 vs 1500 → expected 0.76) who win exactly as often as their rating says.
        // SOGA: average players (1500 vs 1500 → expected 0.5) who win 70% – the faction itself is strong.
        for (int i = 0; i < 100; i++) {
            game(facts, strong.get(i % 6), others.get(i % 6), "ONI", "HELIAN", 1700, 1500, i % 100 < 76 ? 1 : 0,
                    DAY, Set.of(), null);
            game(facts, average.get(i % 6), others.get((i + 1) % 6), "SOGA", "HELIAN", 1500, 1500,
                    i % 10 < 7 ? 1 : 0, DAY, Set.of(), null);
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        MetaReport.Rate oni = r.factions().stream().filter(f -> f.faction().equals("ONI")).findFirst().orElseThrow()
                .rate();
        MetaReport.Rate soga = r.factions().stream().filter(f -> f.faction().equals("SOGA")).findFirst()
                .orElseThrow().rate();
        assertEquals(0.76, oni.score(), 0.001);
        assertEquals(0.0, oni.performance(), 0.01);       // wins explained by the players' ratings
        assertEquals(0.70, soga.score(), 0.001);
        assertEquals(0.20, soga.performance(), 0.01);     // wins beyond the ratings
        assertTrue(soga.low() > soga.expected());         // and the interval says it is not noise
        assertTrue(oni.enough());
    }

    @Test
    void mirrorsCountForShareButNotForWinRate() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> p = players(10);
        for (int i = 0; i < 5; i++) {
            game(facts, p.get(i), p.get(i + 5), "ONI", "ONI", 1500, 1500, 1, DAY, Set.of(), null);
            game(facts, p.get(i), p.get(i + 5), "ONI", "SOGA", 1500, 1500, 0, DAY, Set.of(), null);
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        MetaReport.FactionRow oni = r.factions().stream().filter(f -> f.faction().equals("ONI")).findFirst()
                .orElseThrow();
        assertEquals(15, oni.sides());               // 10 mirror sides + 5
        assertEquals(5, oni.rate().n());             // mirrors left out
        assertEquals(0.0, oni.rate().score());
        assertEquals(5, r.summary().mirrorGames());
        assertEquals(0.75, oni.share(), 0.0001);
    }

    @Test
    void rowsBehindTooFewPlayersAreHidden() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> few = players(4);
        List<UUID> many = players(6);
        for (int i = 0; i < 12; i++) {
            game(facts, few.get(i % 4), many.get(i % 6), "GOBLIN", "SAND", 1500, 1500, i % 2, DAY, Set.of(), null);
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        assertTrue(r.factions().stream().noneMatch(f -> f.faction().equals("GOBLIN")));
        assertTrue(r.factions().stream().anyMatch(f -> f.faction().equals("SAND")));
        assertTrue(r.summary().hiddenRows() >= 1);
        assertFalse(r.factions().get(0).rate().enough());   // 12 < MIN_SAMPLE
    }

    @Test
    void unitsCompareListsWithAndWithoutTheCharacter() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> p = players(10);
        for (int i = 0; i < 10; i++) {
            // 5 lists with the chimera win, 5 without lose.
            boolean with = i < 5;
            game(facts, p.get(i), p.get((i + 5) % 10), "SAND", "SOGA", 1500, 1500, with ? 1 : 0, DAY,
                    with ? Set.of("CHIMERA", "VIZIER") : Set.of("VIZIER"), "TREASURE_HUNT");
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        MetaReport.UnitRow chimera = r.units().stream().filter(u -> u.unit().equals("CHIMERA")).findFirst()
                .orElseThrow();
        assertEquals(0.5, chimera.pickRate());
        assertEquals(1.0, chimera.with().score());
        assertEquals(0.0, chimera.without().score());
        MetaReport.UnitRow vizier = r.units().stream().filter(u -> u.unit().equals("VIZIER")).findFirst()
                .orElseThrow();
        assertEquals(1.0, vizier.pickRate());
        assertEquals(0, vizier.without().n());
        assertEquals(1, r.missions().size());
        assertEquals(10, r.missions().get(0).games());
        assertEquals(5.0, r.missions().get(0).avgMargin());
    }

    @Test
    void filterAndMonthsCountNewPlayersFromWholeHistory() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> p = players(6);
        game(facts, p.get(0), p.get(1), "ONI", "SOGA", 1500, 1500, 1, LocalDate.of(2026, 3, 5), Set.of(), null);
        game(facts, p.get(0), p.get(2), "ONI", "SOGA", 1600, 1400, 1, LocalDate.of(2026, 4, 5), Set.of(), null);
        game(facts, p.get(3), p.get(1), "ONI", "SOGA", 1500, 1480, 0, LocalDate.of(2026, 4, 9), Set.of(), null);
        MetaReport april = MetaStats.compute(facts,
                new MetaFilter(LocalDate.of(2026, 4, 1), null, null, null, null, null));
        assertEquals(2, april.summary().games());
        assertEquals(1, april.months().size());
        assertEquals(4, april.months().get(0).activePlayers());
        assertEquals(2, april.months().get(0).newPlayers());   // p2 and p3; p0 and p1 started in March
        MetaReport rated = MetaStats.compute(facts, new MetaFilter(null, null, null, null, null, 1450));
        assertEquals(2, rated.summary().games());               // the 1600 vs 1400 game is left out
    }

    @Test
    void itemsCompareListsWithAndWithoutAndMeasureGearLoad() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> p = players(10);
        List<UUID> opp = players(10);
        for (int i = 0; i < 10; i++) {
            boolean with = i < 5;
            List<SideFact.ItemUse> items = with
                    ? List.of(new SideFact.ItemUse("KING", "VIZIER", true, false),
                            new SideFact.ItemUse("POUCH", "GUARD", false, false),
                            new SideFact.ItemUse("POUCH", "GUARD", false, true))
                    : List.of();
            UUID id = UUID.randomUUID();
            double score = with ? 1 : 0;
            facts.add(new SideFact(id, p.get(i), opp.get(i), DAY, SideFact.Source.OWN, null, null, null, "SAND", "SOGA",
                    Set.of("VIZIER", "GUARD"), null, 1500, 1500, score, with ? 8 : 3, with ? 3 : 8, items, 80,
                    with ? 20 : 0));
            facts.add(new SideFact(id, opp.get(i), p.get(i), DAY, SideFact.Source.OWN, null, null, null, "SOGA", "SAND",
                    Set.of(), null, 1500, 1500, 1 - score, with ? 3 : 8, with ? 8 : 3));
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        MetaReport.ItemRow king = r.items().stream().filter(x -> x.item().equals("KING")).findFirst().orElseThrow();
        assertEquals(0.5, king.pickRate());
        assertEquals(1.0, king.with().score());
        assertEquals(0.0, king.without().score());
        assertEquals("VIZIER", king.topUnit());
        assertEquals(1.0, king.topUnitShare());
        assertEquals(1.0, king.leaderShare());
        MetaReport.ItemRow pouch = r.items().stream().filter(x -> x.item().equals("POUCH")).findFirst().orElseThrow();
        assertEquals(2.0, pouch.avgCopies());
        assertEquals(0.5, pouch.reducedShare());
        assertEquals(0.0, pouch.leaderShare());
        assertTrue(r.itemCounts().stream().anyMatch(c -> c.item().equals("KING") && c.lists() == 5));
        MetaReport.GearRow gear = r.gear().get(0);
        assertEquals(1.5, gear.avgItems());
        assertEquals(0.1, gear.avgItemShare(), 0.0001);
        MetaReport.Cell medium = r.gearResults().stream().filter(c -> c.col().equals("MEDIUM")).findFirst()
                .orElseThrow();
        assertEquals(1.0, medium.rate().score());
        MetaReport.Cell light = r.gearResults().stream().filter(c -> c.col().equals("LIGHT")).findFirst()
                .orElseThrow();
        assertEquals(0.0, light.rate().score());
    }

    private static List<SideFact.TurnVp> turns(int... vp) {
        List<SideFact.TurnVp> out = new ArrayList<>();
        for (int t = 0; t < vp.length; t++) {
            out.add(new SideFact.TurnVp(t + 1, vp[t], 0));
        }
        return out;
    }

    @Test
    void flowFindsDecidingTurnComebacksAndSchemeChoices() {
        List<SideFact> facts = new ArrayList<>();
        List<UUID> a = players(10);
        List<UUID> b = players(10);
        for (int i = 0; i < 10; i++) {
            boolean comeback = i < 5;
            // comeback: 1,2,3,6,9 vs 2,4,4,5,5 – behind after turn 3, ahead for good from turn 4
            // wire to wire: 3,4,5,6,7 vs 0,1,2,3,4 – ahead from turn 1
            List<SideFact.TurnVp> ta = comeback ? turns(1, 1, 1, 3, 3) : turns(3, 1, 1, 1, 1);
            List<SideFact.TurnVp> tb = comeback ? turns(2, 2, 0, 1, 0) : turns(0, 1, 1, 1, 1);
            UUID id = UUID.randomUUID();
            facts.add(new SideFact(id, a.get(i), b.get(i), DAY, SideFact.Source.TOURNAMENT, null, "PL", "LOCAL", "ONI",
                    "SOGA", Set.of(), "TREASURE_HUNT", 1500, 1500, 1, comeback ? 9 : 7, comeback ? 5 : 4, List.of(), 0, 0,
                    ta, List.of("X", "Y"), "X"));
            facts.add(new SideFact(id, b.get(i), a.get(i), DAY, SideFact.Source.TOURNAMENT, null, "PL", "LOCAL", "SOGA",
                    "ONI", Set.of(), "TREASURE_HUNT", 1500, 1500, 0, comeback ? 5 : 4, comeback ? 9 : 7, List.of(), 0, 0,
                    tb, List.of("X", "Z"), "Z"));
        }
        MetaReport r = MetaStats.compute(facts, MetaFilter.ALL);
        MetaReport.Flow flow = r.flow();
        assertEquals(10, flow.games());
        assertEquals(10, flow.decided());
        assertEquals(5, flow.turns());
        assertEquals(List.of(5, 0, 0, 5, 0), flow.decidedBy());
        assertEquals(3, flow.comebackTurn());
        assertEquals(5, flow.comebacks());
        assertEquals(1.5, flow.byTurn().get(0).scenario());
        MetaReport.FactionFlow oni = r.factionFlow().stream().filter(f -> f.faction().equals("ONI")).findFirst()
                .orElseThrow();
        assertEquals(8.0, oni.scenarioVp());
        MetaReport.SchemeRow x = r.schemes().stream().filter(s -> s.scheme().equals("X")).findFirst().orElseThrow();
        assertEquals(20, x.drawn());
        assertEquals(10, x.kept());
        assertEquals(0.5, x.keepRate());
        assertEquals(1.0, x.rate().score());
        MetaReport.SchemeRow y = r.schemes().stream().filter(s -> s.scheme().equals("Y")).findFirst().orElseThrow();
        assertEquals(0, y.kept());
        assertEquals(0.0, y.keepRate());
        assertEquals(1.0, r.schemes().get(0).keepRate());   // Z: always kept when drawn
    }
}
