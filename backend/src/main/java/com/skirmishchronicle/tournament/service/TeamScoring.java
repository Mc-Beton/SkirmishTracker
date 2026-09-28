package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.RoundPhase;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.TeamMatch;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentPenalty;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Team results (framework-free). A team match is won by more game wins, then more big points, then more small
 * points; otherwise it is a draw (in a knockout round the higher seed advances). Team standings: team match wins,
 * then big points (minus the members' penalties), then small points.
 */
public final class TeamScoring {

    /** Aggregate of one team match. winner == null: draw or not finished yet. */
    public record Aggregate(int gameWinsA, int gameWinsB, int bigA, int bigB, int smallA, int smallB,
                            boolean complete, UUID winner) {
    }

    public static final class Row {
        public final UUID teamId;
        public int wins;
        public int draws;
        public int losses;
        public int gameWins;
        public int bigPoints;
        public int penaltyPoints;
        public int smallPoints;
        public int played;
        public boolean hadBye;
        public final Set<UUID> opponents = new HashSet<>();

        Row(UUID teamId) {
            this.teamId = teamId;
        }

        public int totalBig() {
            return bigPoints - penaltyPoints;
        }
    }

    private TeamScoring() {
    }

    /** Points of side A and B of a single confirmed game; null when not confirmed. */
    static int[] gamePoints(TournamentMatch m, TournamentRound round, TournamentSettings s) {
        if (m.getStatus() != MatchStatus.CONFIRMED || m.getResultType() == null) {
            return null;
        }
        return switch (m.getResultType()) {
            case BYE -> new int[] {round.getByeBigPoints(), 0, round.getByeSmallPoints(), 0};
            case SPLIT -> new int[] {s.splitBigPoints(), s.splitBigPoints(), s.splitSmallPoints(), s.splitSmallPoints()};
            default -> new int[] {s.bigPointsForGame(m.getSmallA(), m.getSmallB()),
                    s.bigPointsForGame(m.getSmallB(), m.getSmallA()), m.getSmallA(), m.getSmallB()};
        };
    }

    /**
     * Aggregates the games of a team match. Games are oriented by membership: a game counts for team A when its
     * player A belongs to team A (line-ups may put a team's player on either side of the table sheet).
     */
    public static Aggregate aggregate(TeamMatch tm, List<TournamentMatch> games, TournamentRound round,
                                      TournamentSettings s, Map<UUID, UUID> teamOfPlayer, boolean knockout) {
        int wa = 0;
        int wb = 0;
        int ba = 0;
        int bb = 0;
        int sa = 0;
        int sb = 0;
        boolean complete = !games.isEmpty();
        for (TournamentMatch g : games) {
            int[] p = gamePoints(g, round, s);
            if (p == null) {
                complete = false;
                continue;
            }
            boolean flipped = !tm.isBye() && tm.getTeamB().equals(teamOfPlayer.get(g.getPlayerA()));
            int myBig = flipped ? p[1] : p[0];
            int theirBig = flipped ? p[0] : p[1];
            int mySmall = flipped ? p[3] : p[2];
            int theirSmall = flipped ? p[2] : p[3];
            ba += myBig;
            bb += theirBig;
            sa += mySmall;
            sb += theirSmall;
            if (g.getResultType() == MatchResultType.BYE) {
                wa++;
            } else if (g.getResultType() == MatchResultType.PLAYED) {
                if (mySmall > theirSmall) {
                    wa++;
                } else if (theirSmall > mySmall) {
                    wb++;
                }
            }
        }
        UUID winner = null;
        if (tm.isBye()) {
            winner = complete ? tm.getTeamA() : null;
        } else if (complete) {
            int cmp = wa != wb ? Integer.compare(wa, wb) : ba != bb ? Integer.compare(ba, bb) : Integer.compare(sa, sb);
            if (cmp > 0) {
                winner = tm.getTeamA();
            } else if (cmp < 0) {
                winner = tm.getTeamB();
            } else if (knockout) {
                winner = seedOr(tm.getSeedA()) <= seedOr(tm.getSeedB()) ? tm.getTeamA() : tm.getTeamB();
            }
        }
        return new Aggregate(wa, wb, ba, bb, sa, sb, complete, winner);
    }

    static int seedOr(Integer seed) {
        return seed == null ? Integer.MAX_VALUE : seed;
    }

    /**
     * Team standings over the given team matches (opponent history counts as soon as teams are paired, results only
     * once every game of the team match is confirmed).
     */
    public static List<Row> compute(Collection<UUID> teamIds, List<TeamMatch> teamMatches,
                                    Map<UUID, List<TournamentMatch>> gamesByTeamMatch,
                                    List<TournamentRound> rounds, List<TournamentPenalty> penalties,
                                    Map<UUID, UUID> teamOfPlayer, TournamentSettings s) {
        Map<UUID, Row> rows = new LinkedHashMap<>();
        teamIds.forEach(id -> rows.put(id, new Row(id)));
        Map<UUID, TournamentRound> roundById = new HashMap<>();
        rounds.forEach(r -> roundById.put(r.getId(), r));
        for (TeamMatch tm : teamMatches) {
            Row a = rows.computeIfAbsent(tm.getTeamA(), Row::new);
            Row b = tm.isBye() ? null : rows.computeIfAbsent(tm.getTeamB(), Row::new);
            if (b == null) {
                a.hadBye = true;
            } else {
                a.opponents.add(b.teamId);
                b.opponents.add(a.teamId);
            }
            TournamentRound round = roundById.get(tm.getRoundId());
            if (round == null) {
                continue;
            }
            boolean ko = round.getPhase() == RoundPhase.KNOCKOUT;
            Aggregate g = aggregate(tm, gamesByTeamMatch.getOrDefault(tm.getId(), List.of()), round, s, teamOfPlayer, ko);
            if (!g.complete()) {
                continue;
            }
            a.played++;
            a.gameWins += g.gameWinsA();
            a.bigPoints += g.bigA();
            a.smallPoints += g.smallA();
            if (b == null) {
                a.wins++;
                continue;
            }
            b.played++;
            b.gameWins += g.gameWinsB();
            b.bigPoints += g.bigB();
            b.smallPoints += g.smallB();
            // Standings count the real result; the knockout seed tie-break only decides who advances.
            Aggregate plain = ko ? aggregate(tm, gamesByTeamMatch.getOrDefault(tm.getId(), List.of()), round, s,
                    teamOfPlayer, false) : g;
            if (plain.winner() == null) {
                a.draws++;
                b.draws++;
            } else if (plain.winner().equals(a.teamId)) {
                a.wins++;
                b.losses++;
            } else {
                b.wins++;
                a.losses++;
            }
        }
        for (TournamentPenalty p : penalties) {
            UUID team = teamOfPlayer.get(p.getUserId());
            if (team != null) {
                rows.computeIfAbsent(team, Row::new).penaltyPoints += p.getBigPoints();
            }
        }
        List<Row> sorted = new ArrayList<>(rows.values());
        sorted.sort(Comparator.comparingInt((Row r) -> r.wins).reversed()
                .thenComparing(Comparator.comparingInt(Row::totalBig).reversed())
                .thenComparing(Comparator.comparingInt((Row r) -> r.smallPoints).reversed()));
        return sorted;
    }

    /** Only started (not merely paired) rounds count. */
    static boolean counts(TournamentRound r) {
        return r.getStatus() != RoundStatus.PAIRED;
    }
}
