package com.skirmishchronicle.tournament.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.GameSystem;
import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.rating.RatedGame;
import com.skirmishchronicle.tournament.domain.DifferenceRow;
import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.ScoringMode;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Bolt Action scoring: scenario points decide, secondaries break a tie, table by TP → scenario → secondary. */
class BoltActionScoringTest {

    private static TournamentSettings ba(boolean secondary, Integer maxPrimary, Integer maxSecondary) {
        return new TournamentSettings(FirstRoundMode.RANDOM, false, true, false, false, false, false,
                ScoringMode.WIN_DRAW_LOSS, 30, 15, 5, 2, 30, 0, 15, 0, DifferenceRow.parse(DifferenceRow.DEFAULT), 0,
                null, false, GameSystem.BOLT_ACTION, secondary, maxPrimary, maxSecondary);
    }

    private static TournamentMatch game(UUID a, UUID b, int sa, int sb, Integer xa, Integer xb) {
        TournamentMatch m = new TournamentMatch(UUID.randomUUID(), UUID.randomUUID(), 1, a, b);
        m.setResult(UUID.randomUUID(), MatchResultType.PLAYED, sa, sb, xa, xb);
        return m;
    }

    @Test
    void secondariesBreakAScenarioTie() {
        assertEquals(1, TournamentSettings.outcome(5, 3, 0, 9));
        assertEquals(-1, TournamentSettings.outcome(4, 4, 1, 3));
        assertEquals(0, TournamentSettings.outcome(4, 4, 2, 2));
        assertEquals(0, TournamentSettings.outcome(4, 4, null, null));
    }

    @Test
    void organizerSetsWinDrawLossPoints() {
        TournamentSettings s = ba(true, null, null);
        assertEquals(30, s.bigPointsForResult(4, 4, 1));
        assertEquals(15, s.bigPointsForResult(4, 4, 0));
        assertEquals(5, s.bigPointsForResult(1, 6, -1));
    }

    @Test
    void tableOrderIsTournamentPointsThenScenarioThenSecondary() {
        UUID x = UUID.randomUUID();
        UUID y = UUID.randomUUID();
        UUID z = UUID.randomUUID();
        UUID w = UUID.randomUUID();
        TournamentSettings s = ba(true, null, null);
        // x beats y on secondaries (scenario tie 3:3); z beats w on scenario (6:2).
        List<TournamentMatch> games = List.of(game(x, y, 3, 3, 4, 1), game(z, w, 6, 2, 0, 5));
        List<Standings.Row> rows = Standings.compute(List.of(x, y, z, w), games, List.of(), List.of(), s);
        // Both winners have 30 TP; z has more scenario points (6 > 3). Losers: 5 TP each, y has 3 scenario > w's 2.
        assertEquals(List.of(z, x, y, w), rows.stream().map(r -> r.userId).toList());
        assertEquals(30, rows.get(1).bigPoints);
        assertEquals(4, rows.get(1).secondaryPoints);
        assertEquals(1, rows.get(1).wins);
    }

    @Test
    void secondaryPointsAreTheLastTieBreaker() {
        UUID x = UUID.randomUUID();
        UUID y = UUID.randomUUID();
        UUID z = UUID.randomUUID();
        UUID w = UUID.randomUUID();
        TournamentSettings s = ba(true, null, null);
        List<TournamentMatch> games = List.of(game(x, y, 5, 1, 2, 0), game(z, w, 5, 1, 7, 0));
        List<Standings.Row> rows = Standings.compute(List.of(x, y, z, w), games, List.of(), List.of(), s);
        assertEquals(z, rows.get(0).userId);
        assertEquals(x, rows.get(1).userId);
    }

    @Test
    void limitsAndRequiredSecondaries() {
        TournamentSettings s = ba(true, 10, 3);
        RoundService.validateScore(s, 10, 0, 3, 0);
        assertEquals("SCORE_OVER_LIMIT",
                assertThrows(ApiException.class, () -> RoundService.validateScore(s, 11, 0, 0, 0)).getCode());
        assertEquals("SECONDARY_OVER_LIMIT",
                assertThrows(ApiException.class, () -> RoundService.validateScore(s, 1, 0, 4, 0)).getCode());
        assertEquals("SECONDARY_REQUIRED",
                assertThrows(ApiException.class, () -> RoundService.validateScore(s, 1, 0, null, 0)).getCode());
        // One slot: secondaries are not needed.
        RoundService.validateScore(ba(false, null, null), 1, 0, null, null);
    }

    @Test
    void eloUsesSecondariesForATie() {
        RatedGame g = new RatedGame(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 3, 3, Instant.now(), null,
                null, 1, 4, GameSystem.BOLT_ACTION);
        assertEquals(0.0, g.scoreA());
    }
}
