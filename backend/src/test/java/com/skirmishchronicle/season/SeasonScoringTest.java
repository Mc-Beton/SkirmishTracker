package com.skirmishchronicle.season;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SeasonScoringTest {

    @Test
    void placePointsScaleWithTheField() {
        assertEquals(100, SeasonScoring.points(100, 10, 1));
        assertEquals(50, SeasonScoring.points(100, 10, 6));
        assertEquals(10, SeasonScoring.points(100, 10, 10));
        assertEquals(0, SeasonScoring.points(100, 10, 11));
        assertEquals(400, SeasonScoring.points(400, 24, 1));
    }

    @Test
    void onlyTheBestResultsCountAndTiesSharePositions() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        UUID t1 = UUID.randomUUID();
        UUID t2 = UUID.randomUUID();
        UUID t3 = UUID.randomUUID();
        List<SeasonScoring.Result> results = List.of(
                new SeasonScoring.Result(a, t1, 100, 10, 1),   // 100
                new SeasonScoring.Result(a, t2, 100, 10, 10),  // 10 – not counted with best 2
                new SeasonScoring.Result(a, t3, 200, 10, 6),   // 100
                new SeasonScoring.Result(b, t1, 100, 10, 2),   // 90
                new SeasonScoring.Result(b, t3, 200, 10, 5),   // 120 → 210
                new SeasonScoring.Result(c, t2, 200, 10, 1));  // 200
        List<SeasonScoring.Row> rows = SeasonScoring.rank(results, 2);
        assertEquals(b, rows.get(0).userId());
        assertEquals(210, rows.get(0).points());
        assertEquals(200, rows.get(1).points());
        assertEquals(2, rows.get(1).position());          // a and c tie on 200 → both 2nd
        assertEquals(2, rows.get(2).position());
        SeasonScoring.Row rowA = rows.stream().filter(r -> r.userId().equals(a)).findFirst().orElseThrow();
        assertEquals(3, rowA.events());
        assertEquals(2, rowA.results().stream().filter(SeasonScoring.Scored::counted).count());
        assertFalse(rowA.results().get(2).counted());
        assertTrue(rowA.results().get(0).counted());
    }
}
