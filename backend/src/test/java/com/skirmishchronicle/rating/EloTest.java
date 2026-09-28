package com.skirmishchronicle.rating;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EloTest {

    private static RatedGame game(UUID a, UUID b, int sa, int sb, long minute) {
        return new RatedGame(UUID.randomUUID(), a, b, sa, sb, Instant.ofEpochSecond(minute * 60), null, null);
    }

    @Test
    void equalPlayersMoveSixteenPoints() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        Map<UUID, Elo.Rating> r = Elo.replay(List.of(game(a, b, 8, 2, 1)));
        assertEquals(1516, r.get(a).rounded());
        assertEquals(1484, r.get(b).rounded());
        assertEquals(1, r.get(a).wins);
        assertEquals(1, r.get(b).losses);
    }

    @Test
    void drawBetweenEqualPlayersChangesNothingAndOrderMatters() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        Map<UUID, Elo.Rating> r = Elo.replay(List.of(game(a, b, 5, 5, 1)));
        assertEquals(1500, r.get(a).rounded());
        assertEquals(1, r.get(a).draws);
        // a beats c first, then draws with b: b gains a little because a is now stronger.
        Map<UUID, Elo.Rating> r2 = Elo.replay(List.of(game(a, b, 5, 5, 2), game(a, c, 9, 1, 1)));
        assertTrue(r2.get(b).value > 1500.0, "b gained");
        assertEquals(2, r2.get(a).history.size());
        // Zero-sum.
        double sum = r2.values().stream().mapToDouble(x -> x.value).sum();
        assertTrue(Math.abs(sum - 4500.0) < 1e-9, "zero sum");
    }

    @Test
    void upsetIsWorthMore() {
        assertTrue(Elo.expected(1700, 1500) > 0.75);
        UUID strong = UUID.randomUUID();
        UUID weak = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        // Make "strong" 1700-ish, then lose to "weak".
        List<RatedGame> games = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) {
            games.add(game(strong, other, 9, 0, i));
        }
        games.add(game(weak, strong, 7, 3, 100));
        Map<UUID, Elo.Rating> r = Elo.replay(games);
        assertTrue(r.get(weak).rounded() - 1500 > 16, "upset gain");
    }
}
