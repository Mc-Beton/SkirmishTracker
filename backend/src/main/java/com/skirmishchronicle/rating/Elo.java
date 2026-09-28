package com.skirmishchronicle.rating;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * ELO replay (framework-free): every player starts at {@link #START}, games are applied in chronological order
 * with K = {@link #K}. Ratings are kept as doubles and rounded only for display.
 */
public final class Elo {

    public static final int START = 1500;
    public static final int K = 32;

    /** Rating and W/D/L of one player after the replay. */
    public static final class Rating {
        public double value = START;
        public int wins;
        public int draws;
        public int losses;
        public int games;
        public final List<Point> history = new ArrayList<>();

        public int rounded() {
            return (int) Math.round(value);
        }
    }

    /** Rating of a player right after a game (for the profile chart). */
    public record Point(UUID gameId, java.time.Instant at, int rating, int change) {
    }

    private Elo() {
    }

    public static double expected(double rating, double opponent) {
        return 1.0 / (1.0 + Math.pow(10.0, (opponent - rating) / 400.0));
    }

    public static Map<UUID, Rating> replay(List<RatedGame> games) {
        List<RatedGame> ordered = new ArrayList<>(games);
        ordered.sort(Comparator.comparing(RatedGame::playedAt, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(g -> g.id().toString()));
        Map<UUID, Rating> ratings = new HashMap<>();
        for (RatedGame g : ordered) {
            Rating a = ratings.computeIfAbsent(g.playerA(), k -> new Rating());
            Rating b = ratings.computeIfAbsent(g.playerB(), k -> new Rating());
            double sa = g.scoreA();
            double ea = expected(a.value, b.value);
            double delta = K * (sa - ea);
            int beforeA = a.rounded();
            int beforeB = b.rounded();
            a.value += delta;
            b.value -= delta;
            a.games++;
            b.games++;
            if (sa == 1.0) {
                a.wins++;
                b.losses++;
            } else if (sa == 0.0) {
                b.wins++;
                a.losses++;
            } else {
                a.draws++;
                b.draws++;
            }
            a.history.add(new Point(g.id(), g.playedAt(), a.rounded(), a.rounded() - beforeA));
            b.history.add(new Point(g.id(), g.playedAt(), b.rounded(), b.rounded() - beforeB));
        }
        return ratings;
    }
}
