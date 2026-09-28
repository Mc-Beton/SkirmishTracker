package com.skirmishchronicle.tournament.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.tournament.domain.DifferenceRow;
import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.RoundPhase;
import com.skirmishchronicle.tournament.domain.ScoringMode;
import com.skirmishchronicle.tournament.domain.TeamMatch;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentPenalty;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TeamScoringTest {

    private final TournamentSettings s = new TournamentSettings(FirstRoundMode.RANDOM, false, true, false, false,
            false, false, ScoringMode.WIN_DRAW_LOSS, 3, 1, 0, 2, 3, 0, 1, 0, DifferenceRow.parse(DifferenceRow.DEFAULT),
            0, 3, false);
    private final UUID tid = UUID.randomUUID();
    private final UUID red = UUID.randomUUID();
    private final UUID blue = UUID.randomUUID();
    private final Map<UUID, UUID> teamOf = new HashMap<>();
    private final List<UUID> redPlayers = new ArrayList<>();
    private final List<UUID> bluePlayers = new ArrayList<>();

    TeamScoringTest() {
        for (int i = 0; i < 3; i++) {
            UUID r = UUID.randomUUID();
            UUID b = UUID.randomUUID();
            redPlayers.add(r);
            bluePlayers.add(b);
            teamOf.put(r, red);
            teamOf.put(b, blue);
        }
    }

    private TournamentMatch game(TournamentRound round, UUID a, UUID b, int sa, int sb) {
        TournamentMatch m = new TournamentMatch(round.getId(), tid, 1, a, b);
        m.setResult(UUID.randomUUID(), MatchResultType.PLAYED, sa, sb);
        return m;
    }

    @Test
    void gameWinsBeatSmallPoints() {
        TournamentRound round = new TournamentRound(tid, 1, 3, 0, RoundPhase.SWISS);
        TeamMatch tm = new TeamMatch(round.getId(), tid, 1, red, blue, null, null);
        // Board 2 is written with the Blue player as player A: orientation must follow membership.
        List<TournamentMatch> games = List.of(
                game(round, redPlayers.get(0), bluePlayers.get(0), 6, 5),
                game(round, bluePlayers.get(1), redPlayers.get(1), 5, 6),
                game(round, redPlayers.get(2), bluePlayers.get(2), 0, 10));
        TeamScoring.Aggregate g = TeamScoring.aggregate(tm, games, round, s, teamOf, false);
        assertTrue(g.complete());
        assertEquals(2, g.gameWinsA());
        assertEquals(1, g.gameWinsB());
        assertEquals(12, g.smallA());
        assertEquals(20, g.smallB());
        assertEquals(red, g.winner());
    }

    @Test
    void equalWinsFallBackToBigThenSmallThenDraw() {
        TournamentRound round = new TournamentRound(tid, 1, 3, 0, RoundPhase.SWISS);
        TeamMatch tm = new TeamMatch(round.getId(), tid, 1, red, blue, null, null);
        // 1 win each + 1 draw: big points equal (3+1 vs 3+1); small 8+5+4 vs 2+5+9 → Red 17, Blue 16.
        List<TournamentMatch> games = List.of(
                game(round, redPlayers.get(0), bluePlayers.get(0), 8, 2),
                game(round, redPlayers.get(1), bluePlayers.get(1), 5, 5),
                game(round, redPlayers.get(2), bluePlayers.get(2), 4, 9));
        assertEquals(red, TeamScoring.aggregate(tm, games, round, s, teamOf, false).winner());
        List<TournamentMatch> level = List.of(
                game(round, redPlayers.get(0), bluePlayers.get(0), 8, 2),
                game(round, redPlayers.get(1), bluePlayers.get(1), 5, 5),
                game(round, redPlayers.get(2), bluePlayers.get(2), 2, 8));
        assertNull(TeamScoring.aggregate(tm, level, round, s, teamOf, false).winner());
        TeamMatch ko = new TeamMatch(round.getId(), tid, 1, blue, red, 2, 1);
        assertEquals(red, TeamScoring.aggregate(ko, level, round, s, teamOf, true).winner(), "higher seed advances");
    }

    @Test
    void unfinishedMatchHasNoWinnerAndStandingsCountPenalties() {
        TournamentRound round = new TournamentRound(tid, 1, 3, 0, RoundPhase.SWISS);
        TeamMatch tm = new TeamMatch(round.getId(), tid, 1, red, blue, null, null);
        TournamentMatch open = new TournamentMatch(round.getId(), tid, 3, redPlayers.get(2), bluePlayers.get(2));
        List<TournamentMatch> games = List.of(
                game(round, redPlayers.get(0), bluePlayers.get(0), 6, 5),
                game(round, redPlayers.get(1), bluePlayers.get(1), 6, 5), open);
        TeamScoring.Aggregate g = TeamScoring.aggregate(tm, games, round, s, teamOf, false);
        assertFalse(g.complete());
        assertNull(g.winner());
        open.setResult(UUID.randomUUID(), MatchResultType.PLAYED, 1, 9);
        List<TournamentPenalty> pens = List.of(new TournamentPenalty(tid, redPlayers.get(0), 2, "late", UUID.randomUUID()));
        Map<UUID, List<TournamentMatch>> byTm = Map.of(tm.getId(), games);
        List<TeamScoring.Row> rows = TeamScoring.compute(List.of(red, blue), List.of(tm), byTm, List.of(round), pens,
                teamOf, s);
        assertEquals(red, rows.get(0).teamId);
        assertEquals(1, rows.get(0).wins);
        assertEquals(2, rows.get(0).penaltyPoints);
        assertEquals(6 - 2, rows.get(0).totalBig());
        assertEquals(1, rows.get(1).losses);
        assertTrue(rows.get(1).opponents.contains(red));
    }

    @Test
    void byeTeamWinsWithByePoints() {
        TournamentRound round = new TournamentRound(tid, 1, 3, 5, RoundPhase.SWISS);
        TeamMatch tm = new TeamMatch(round.getId(), tid, 1, red, null, null, null);
        List<TournamentMatch> games = new ArrayList<>();
        for (UUID p : redPlayers) {
            TournamentMatch m = new TournamentMatch(round.getId(), tid, 1, p, null);
            m.setResult(UUID.randomUUID(), MatchResultType.BYE, null, null);
            games.add(m);
        }
        TeamScoring.Aggregate g = TeamScoring.aggregate(tm, games, round, s, teamOf, false);
        assertEquals(red, g.winner());
        assertEquals(9, g.bigA());
        assertEquals(15, g.smallA());
        assertEquals(3, g.gameWinsA());
    }
}
