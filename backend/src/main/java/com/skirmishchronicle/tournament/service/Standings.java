package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentPenalty;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Computes standings from confirmed matches. Order: wins, big points, small points.
 * A draw weighs the same as a loss for the win count; BYE counts as a win.
 */
public final class Standings {

    public static final class Row {
        public final UUID userId;
        public int wins;
        public int draws;
        public int losses;
        public int bigPoints;
        public int smallPoints;
        public int penaltyPoints;
        public int played;
        public boolean hadBye;
        public final Set<UUID> opponents = new HashSet<>();

        Row(UUID userId) {
            this.userId = userId;
        }

        public int totalBig() {
            return bigPoints - penaltyPoints;
        }
    }

    private Standings() {
    }

    public static List<Row> compute(Collection<UUID> players, List<TournamentMatch> matches,
                                    List<TournamentRound> rounds, List<TournamentPenalty> penalties,
                                    TournamentSettings settings) {
        Map<UUID, Row> rows = new LinkedHashMap<>();
        players.forEach(id -> rows.put(id, new Row(id)));
        Map<UUID, TournamentRound> roundById = new LinkedHashMap<>();
        rounds.forEach(r -> roundById.put(r.getId(), r));

        for (TournamentMatch m : matches) {
            // Opponent history counts as soon as players are paired (no rematches even if unreported).
            if (!m.isBye()) {
                rowFor(rows, m.getPlayerA()).opponents.add(m.getPlayerB());
                rowFor(rows, m.getPlayerB()).opponents.add(m.getPlayerA());
            } else {
                rowFor(rows, m.getPlayerA()).hadBye = true;
            }
            if (m.getStatus() != MatchStatus.CONFIRMED) {
                continue;
            }
            if (m.getResultType() == MatchResultType.BYE) {
                TournamentRound round = roundById.get(m.getRoundId());
                Row r = rowFor(rows, m.getPlayerA());
                r.wins++;
                r.played++;
                r.bigPoints += round == null ? settings.byeBigPoints() : round.getByeBigPoints();
                r.smallPoints += round == null ? settings.byeSmallPoints() : round.getByeSmallPoints();
                continue;
            }
            Row a = rowFor(rows, m.getPlayerA());
            Row b = rowFor(rows, m.getPlayerB());
            a.played++;
            b.played++;
            if (m.getResultType() == MatchResultType.SPLIT) {
                a.draws++;
                b.draws++;
                a.bigPoints += settings.splitBigPoints();
                b.bigPoints += settings.splitBigPoints();
                a.smallPoints += settings.splitSmallPoints();
                b.smallPoints += settings.splitSmallPoints();
                continue;
            }
            int sa = m.getSmallA();
            int sb = m.getSmallB();
            a.smallPoints += sa;
            b.smallPoints += sb;
            a.bigPoints += settings.bigPointsForGame(sa, sb);
            b.bigPoints += settings.bigPointsForGame(sb, sa);
            if (sa > sb) {
                a.wins++;
                b.losses++;
            } else if (sb > sa) {
                b.wins++;
                a.losses++;
            } else {
                a.draws++;
                b.draws++;
            }
        }
        for (TournamentPenalty p : penalties) {
            rowFor(rows, p.getUserId()).penaltyPoints += p.getBigPoints();
        }
        List<Row> sorted = new ArrayList<>(rows.values());
        sorted.sort(Comparator.comparingInt((Row r) -> r.wins).reversed()
                .thenComparing(Comparator.comparingInt(Row::totalBig).reversed())
                .thenComparing(Comparator.comparingInt((Row r) -> r.smallPoints).reversed()));
        return sorted;
    }

    private static Row rowFor(Map<UUID, Row> rows, UUID id) {
        return rows.computeIfAbsent(id, Row::new);
    }
}
