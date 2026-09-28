package com.skirmishchronicle.tournament;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.tournament.domain.DifferenceRow;
import com.skirmishchronicle.tournament.domain.ScoringMode;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScoringTest {

    private static TournamentSettings settings(ScoringMode mode, String table) {
        return new TournamentSettings(FirstRoundMode.RANDOM, false, true, false, false, false, false, mode,
                3, 1, 0, 2, 3, 0, 1, 0, DifferenceRow.parse(table), 0, null, false);
    }

    @Test
    void winDrawLoss() {
        TournamentSettings s = settings(ScoringMode.WIN_DRAW_LOSS, null);
        assertEquals(3, s.bigPointsForGame(8, 2));
        assertEquals(0, s.bigPointsForGame(2, 8));
        assertEquals(1, s.bigPointsForGame(5, 5));
    }

    @Test
    void multiplier() {
        TournamentSettings s = settings(ScoringMode.SMALL_POINTS_MULTIPLIER, null);
        assertEquals(16, s.bigPointsForGame(8, 2));
        assertEquals(4, s.bigPointsForGame(2, 8));
    }

    @Test
    void differenceTable() {
        TournamentSettings s = settings(ScoringMode.DIFFERENCE_TABLE, "0:10:10;2:11:9;4:12:8;*:15:5");
        assertEquals(10, s.bigPointsForGame(6, 6));
        assertEquals(11, s.bigPointsForGame(7, 6));
        assertEquals(9, s.bigPointsForGame(6, 8));
        assertEquals(12, s.bigPointsForGame(10, 6));
        assertEquals(15, s.bigPointsForGame(20, 0));
        assertEquals(5, s.bigPointsForGame(0, 20));
    }

    @Test
    void tableCodecAndValidation() {
        List<DifferenceRow> rows = DifferenceRow.parse(DifferenceRow.DEFAULT);
        assertEquals(DifferenceRow.DEFAULT, DifferenceRow.format(rows));
        assertEquals(null, DifferenceRow.validate(rows));
        assertTrue(DifferenceRow.validate(List.of(new DifferenceRow(2, 11, 9))) != null, "last row must be open");
        assertTrue(DifferenceRow.validate(List.of(new DifferenceRow(4, 12, 8), new DifferenceRow(2, 11, 9),
                new DifferenceRow(null, 15, 5))) != null, "ascending");
    }
}
