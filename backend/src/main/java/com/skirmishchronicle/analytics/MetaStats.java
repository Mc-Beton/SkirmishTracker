package com.skirmishchronicle.analytics;

import com.skirmishchronicle.analytics.MetaReport.Cell;
import com.skirmishchronicle.analytics.MetaReport.FactionRow;
import com.skirmishchronicle.analytics.MetaReport.MissionRow;
import com.skirmishchronicle.analytics.MetaReport.MonthRow;
import com.skirmishchronicle.analytics.MetaReport.Rate;
import com.skirmishchronicle.analytics.MetaReport.Summary;
import com.skirmishchronicle.analytics.MetaReport.UnitRow;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Meta statistics over {@link SideFact}s (framework-free, deterministic).
 *
 * <ul>
 *   <li>Faction results leave out mirror games (they always score exactly 50%).</li>
 *   <li>Every rate carries a 95% Wilson interval, so small samples are not mistaken for imbalance.</li>
 *   <li>"Performance" compares the result with what the players' ELO predicted, separating strong factions from
 *       factions that strong players happen to choose.</li>
 *   <li>Privacy: a row backed by fewer than {@code minPlayers} different players is left out (counted in
 *       {@link Summary#hiddenRows()}), so no row describes one or two identifiable people.</li>
 * </ul>
 */
public final class MetaStats {

    public static final int MIN_PLAYERS = 5;
    public static final int MIN_SAMPLE = 20;
    private static final double Z = 1.96;

    private MetaStats() {
    }

    public static MetaReport compute(List<SideFact> all, MetaFilter filter) {
        return compute(all, filter, MIN_PLAYERS, MIN_SAMPLE);
    }

    static MetaReport compute(List<SideFact> all, MetaFilter filter, int minPlayers, int minSample) {
        Map<UUID, LocalDate> firstGame = new HashMap<>();
        for (SideFact f : all) {
            firstGame.merge(f.playerId(), f.playedOn(), (a, b) -> a.isBefore(b) ? a : b);
        }
        List<SideFact> sides = all.stream().filter(filter::matches).toList();
        Map<UUID, List<SideFact>> byGame = new LinkedHashMap<>();
        sides.forEach(f -> byGame.computeIfAbsent(f.gameId(), k -> new ArrayList<>()).add(f));
        int[] hidden = {0};

        List<FactionRow> factions = factions(sides, minPlayers, minSample, hidden);
        List<Cell> matchups = cells(sides.stream()
                .filter(f -> f.faction() != null && f.opponentFaction() != null && !f.mirror()).toList(),
                SideFact::faction, SideFact::opponentFaction, minPlayers, minSample, hidden);
        List<Cell> factionMissions = cells(sides.stream()
                .filter(f -> f.faction() != null && f.mission() != null && !f.mirror()).toList(),
                SideFact::faction, SideFact::mission, minPlayers, minSample, hidden);
        List<UnitRow> units = units(sides, minPlayers, minSample, hidden);
        List<MissionRow> missions = missions(byGame, minPlayers, hidden);
        List<MonthRow> months = months(byGame, firstGame);
        return new MetaReport(summary(sides, byGame, hidden[0]), factions, matchups, units, missions,
                factionMissions, months, new MetaReport.Thresholds(minPlayers, minSample));
    }

    // ------------------------------------------------------------------ sections

    private static Summary summary(List<SideFact> sides, Map<UUID, List<SideFact>> byGame, int hidden) {
        Set<UUID> players = new HashSet<>();
        Set<UUID> tournaments = new HashSet<>();
        int tournamentGames = 0;
        int withFactions = 0;
        int withLists = 0;
        int withMission = 0;
        int mirrors = 0;
        int draws = 0;
        LocalDate first = null;
        LocalDate last = null;
        for (SideFact f : sides) {
            players.add(f.playerId());
            if (f.tournamentId() != null) {
                tournaments.add(f.tournamentId());
            }
        }
        for (List<SideFact> game : byGame.values()) {
            SideFact f = game.get(0);
            if (f.source() == SideFact.Source.TOURNAMENT) {
                tournamentGames++;
            }
            if (game.stream().allMatch(s -> s.faction() != null)) {
                withFactions++;
            }
            if (game.stream().allMatch(s -> !s.units().isEmpty())) {
                withLists++;
            }
            if (f.mission() != null) {
                withMission++;
            }
            if (f.mirror()) {
                mirrors++;
            }
            if (f.score() == 0.5) {
                draws++;
            }
            first = first == null || f.playedOn().isBefore(first) ? f.playedOn() : first;
            last = last == null || f.playedOn().isAfter(last) ? f.playedOn() : last;
        }
        return new Summary(byGame.size(), players.size(), tournaments.size(), tournamentGames,
                byGame.size() - tournamentGames, withFactions, withLists, withMission, mirrors, draws, first, last,
                hidden);
    }

    private static List<FactionRow> factions(List<SideFact> sides, int minPlayers, int minSample, int[] hidden) {
        Map<String, List<SideFact>> byFaction = new TreeMap<>();
        sides.stream().filter(f -> f.faction() != null)
                .forEach(f -> byFaction.computeIfAbsent(f.faction(), k -> new ArrayList<>()).add(f));
        int known = byFaction.values().stream().mapToInt(List::size).sum();
        List<FactionRow> out = new ArrayList<>();
        byFaction.forEach((faction, list) -> {
            Acc all = Acc.of(list);
            if (all.players.size() < minPlayers) {
                hidden[0]++;
                return;
            }
            Acc rated = Acc.of(list.stream().filter(f -> !f.mirror()).toList());
            double avgElo = list.stream().mapToDouble(SideFact::elo).average().orElse(0);
            out.add(new FactionRow(faction, all.players.size(), list.size(), r4((double) list.size() / known),
                    Math.round(avgElo), rated.rate(minSample)));
        });
        out.sort(Comparator.comparingDouble((FactionRow r) -> r.rate().score()).reversed()
                .thenComparing(FactionRow::faction));
        return out;
    }

    private static List<Cell> cells(List<SideFact> sides, Function<SideFact, String> row,
                                    Function<SideFact, String> col, int minPlayers, int minSample, int[] hidden) {
        Map<String, List<SideFact>> groups = new TreeMap<>();
        sides.forEach(f -> groups.computeIfAbsent(row.apply(f) + "\u0000" + col.apply(f), k -> new ArrayList<>())
                .add(f));
        List<Cell> out = new ArrayList<>();
        groups.forEach((key, list) -> {
            Acc acc = Acc.of(list);
            if (acc.players.size() < minPlayers) {
                hidden[0]++;
                return;
            }
            String[] parts = key.split("\u0000", 2);
            out.add(new Cell(parts[0], parts[1], acc.players.size(), acc.rate(minSample)));
        });
        return out;
    }

    private static List<UnitRow> units(List<SideFact> sides, int minPlayers, int minSample, int[] hidden) {
        Map<String, List<SideFact>> byFaction = new TreeMap<>();
        sides.stream().filter(f -> f.faction() != null && !f.units().isEmpty() && !f.mirror())
                .forEach(f -> byFaction.computeIfAbsent(f.faction(), k -> new ArrayList<>()).add(f));
        List<UnitRow> out = new ArrayList<>();
        byFaction.forEach((faction, lists) -> {
            Set<String> codes = new java.util.TreeSet<>();
            lists.forEach(f -> codes.addAll(f.units()));
            for (String unit : codes) {
                Predicate<SideFact> has = f -> f.units().contains(unit);
                Acc with = Acc.of(lists.stream().filter(has).toList());
                if (with.players.size() < minPlayers) {
                    hidden[0]++;
                    continue;
                }
                Acc without = Acc.of(lists.stream().filter(has.negate()).toList());
                out.add(new UnitRow(faction, unit, with.players.size(), r4((double) with.n / lists.size()),
                        with.rate(minSample), without.rate(minSample)));
            }
        });
        out.sort(Comparator.comparing(UnitRow::faction)
                .thenComparing(Comparator.comparingDouble(UnitRow::pickRate).reversed())
                .thenComparing(UnitRow::unit));
        return out;
    }

    private static List<MissionRow> missions(Map<UUID, List<SideFact>> byGame, int minPlayers, int[] hidden) {
        Map<String, List<List<SideFact>>> byMission = new TreeMap<>();
        byGame.values().stream().filter(g -> g.get(0).mission() != null)
                .forEach(g -> byMission.computeIfAbsent(g.get(0).mission(), k -> new ArrayList<>()).add(g));
        List<MissionRow> out = new ArrayList<>();
        byMission.forEach((mission, games) -> {
            Set<UUID> players = new HashSet<>();
            int draws = 0;
            double winner = 0;
            double loser = 0;
            double margin = 0;
            for (List<SideFact> g : games) {
                SideFact f = g.get(0);
                players.add(f.playerId());
                players.add(f.opponentId());
                margin += Math.abs(f.vpFor() - f.vpAgainst());
                if (f.score() == 0.5) {
                    draws++;
                } else {
                    winner += Math.max(f.vpFor(), f.vpAgainst());
                    loser += Math.min(f.vpFor(), f.vpAgainst());
                }
            }
            if (players.size() < minPlayers) {
                hidden[0]++;
                return;
            }
            int decided = games.size() - draws;
            out.add(new MissionRow(mission, games.size(), players.size(), r4((double) draws / games.size()),
                    decided == 0 ? 0 : r2(winner / decided), decided == 0 ? 0 : r2(loser / decided),
                    r2(margin / games.size())));
        });
        out.sort(Comparator.comparingInt(MissionRow::games).reversed().thenComparing(MissionRow::mission));
        return out;
    }

    private static List<MonthRow> months(Map<UUID, List<SideFact>> byGame, Map<UUID, LocalDate> firstGame) {
        Map<YearMonth, List<List<SideFact>>> byMonth = new TreeMap<>();
        byGame.values().forEach(g -> byMonth.computeIfAbsent(YearMonth.from(g.get(0).playedOn()),
                k -> new ArrayList<>()).add(g));
        List<MonthRow> out = new ArrayList<>();
        byMonth.forEach((month, games) -> {
            Set<UUID> active = new HashSet<>();
            Set<UUID> tournaments = new HashSet<>();
            games.forEach(g -> g.forEach(f -> {
                active.add(f.playerId());
                if (f.tournamentId() != null) {
                    tournaments.add(f.tournamentId());
                }
            }));
            long fresh = active.stream().filter(p -> YearMonth.from(firstGame.get(p)).equals(month)).count();
            out.add(new MonthRow(month.toString(), games.size(), active.size(), (int) fresh, tournaments.size()));
        });
        return out;
    }

    // ------------------------------------------------------------------ maths

    /** Running totals of a group of sides. */
    private static final class Acc {
        int n;
        int wins;
        int draws;
        int losses;
        double score;
        double expected;
        final Set<UUID> players = new HashSet<>();

        static Acc of(List<SideFact> list) {
            Acc a = new Acc();
            for (SideFact f : list) {
                a.n++;
                a.score += f.score();
                a.expected += f.expected();
                a.players.add(f.playerId());
                if (f.score() == 1.0) {
                    a.wins++;
                } else if (f.score() == 0.0) {
                    a.losses++;
                } else {
                    a.draws++;
                }
            }
            return a;
        }

        Rate rate(int minSample) {
            if (n == 0) {
                return new Rate(0, 0, 0, 0, 0, 0, 0, 0, 0, false);
            }
            double p = score / n;
            double[] ci = wilson(p, n);
            double e = expected / n;
            return new Rate(n, wins, draws, losses, r4(p), r4(ci[0]), r4(ci[1]), r4(e), r4(p - e), n >= minSample);
        }
    }

    /** 95% Wilson score interval for a proportion {@code p} observed over {@code n} trials. */
    static double[] wilson(double p, int n) {
        double z2 = Z * Z;
        double denom = 1 + z2 / n;
        double center = (p + z2 / (2.0 * n)) / denom;
        double margin = Z * Math.sqrt(p * (1 - p) / n + z2 / (4.0 * n * n)) / denom;
        return new double[] {Math.max(0, center - margin), Math.min(1, center + margin)};
    }

    private static double r4(double v) {
        return Math.round(v * 10_000) / 10_000.0;
    }

    private static double r2(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
