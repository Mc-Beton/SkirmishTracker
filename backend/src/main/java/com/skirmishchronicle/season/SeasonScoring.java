package com.skirmishchronicle.season;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Season ranking points (framework-free). A result is worth {@code base × (players − place + 1) / players}
 * (rounded): the winner gets the tier's full base, last place a small share. Each player's best
 * {@code bestResults} results count; ties share a position.
 */
public final class SeasonScoring {

    /** One player's final place in one official tournament. */
    public record Result(UUID userId, UUID tournamentId, int base, int players, int place) {
    }

    public record Scored(UUID tournamentId, int place, int players, int points, boolean counted) {
    }

    public record Row(int position, UUID userId, int points, int events, List<Scored> results) {
    }

    private SeasonScoring() {
    }

    public static int points(int base, int players, int place) {
        if (players <= 0 || place < 1 || place > players) {
            return 0;
        }
        return (int) Math.round((double) base * (players - place + 1) / players);
    }

    public static List<Row> rank(List<Result> results, int bestResults) {
        Map<UUID, List<Scored>> byPlayer = new LinkedHashMap<>();
        for (Result r : results) {
            byPlayer.computeIfAbsent(r.userId(), k -> new ArrayList<>())
                    .add(new Scored(r.tournamentId(), r.place(), r.players(), points(r.base(), r.players(), r.place()),
                            false));
        }
        List<Row> rows = new ArrayList<>();
        byPlayer.forEach((user, list) -> {
            list.sort(Comparator.comparingInt(Scored::points).reversed());
            List<Scored> marked = new ArrayList<>();
            int total = 0;
            for (int i = 0; i < list.size(); i++) {
                Scored s = list.get(i);
                boolean counted = i < bestResults;
                total += counted ? s.points() : 0;
                marked.add(new Scored(s.tournamentId(), s.place(), s.players(), s.points(), counted));
            }
            rows.add(new Row(0, user, total, list.size(), marked));
        });
        rows.sort(Comparator.comparingInt(Row::points).reversed().thenComparing(r -> r.userId().toString()));
        List<Row> out = new ArrayList<>();
        int position = 0;
        Integer prev = null;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            if (prev == null || prev != r.points()) {
                position = i + 1;
            }
            prev = r.points();
            out.add(new Row(position, r.userId(), r.points(), r.events(), r.results()));
        }
        return out;
    }
}
