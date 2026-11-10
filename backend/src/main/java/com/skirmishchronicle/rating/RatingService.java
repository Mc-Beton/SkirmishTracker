package com.skirmishchronicle.rating;

import com.skirmishchronicle.common.GameSystem;
import com.skirmishchronicle.friendly.FriendlyGame;
import com.skirmishchronicle.friendly.FriendlyGameRepository;
import com.skirmishchronicle.friendly.FriendlyGameStatus;
import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ELO per game system (separate rankings): replays every confirmed, played tournament game and every confirmed own game in chronological
 * order (tournament games by round start, own games by the day they were played). The result is cached until a
 * new game is confirmed or a result is corrected.
 */
@Service
public class RatingService {

    public static final int START = Elo.START;

    private record Snapshot(List<Object> key, Map<GameSystem, List<RatedGame>> games,
                            Map<GameSystem, Map<UUID, Elo.Rating>> ratings) {
    }

    private final MatchRepository matches;
    private final FriendlyGameRepository friendly;
    private volatile Snapshot cache;

    public RatingService(MatchRepository matches, FriendlyGameRepository friendly) {
        this.matches = matches;
        this.friendly = friendly;
    }

    /** All rated Eldfall games (tournament + own), unordered. */
    @Transactional(readOnly = true)
    public List<RatedGame> games() {
        return games(GameSystem.ELDFALL);
    }

    /** All rated games of one game system, unordered. */
    @Transactional(readOnly = true)
    public List<RatedGame> games(GameSystem system) {
        return snapshot().games().getOrDefault(system, List.of());
    }

    /** Eldfall ratings of everybody who played at least one rated game. */
    @Transactional(readOnly = true)
    public Map<UUID, Elo.Rating> ratings() {
        return ratings(GameSystem.ELDFALL);
    }

    @Transactional(readOnly = true)
    public Map<UUID, Elo.Rating> ratings(GameSystem system) {
        return snapshot().ratings().getOrDefault(system, Map.of());
    }

    /** Rounded current Eldfall rating per player; players without games get {@link #START}. */
    @Transactional(readOnly = true)
    public Map<UUID, Integer> current(Collection<UUID> ids) {
        return current(ids, GameSystem.ELDFALL);
    }

    @Transactional(readOnly = true)
    public Map<UUID, Integer> current(Collection<UUID> ids, GameSystem system) {
        Map<UUID, Elo.Rating> all = ratings(system == null ? GameSystem.ELDFALL : system);
        Map<UUID, Integer> out = new HashMap<>();
        for (UUID id : ids) {
            Elo.Rating r = all.get(id);
            out.put(id, r == null ? START : r.rounded());
        }
        return out;
    }

    private Snapshot snapshot() {
        List<Object> key = new ArrayList<>();
        key.addAll(java.util.Arrays.asList(matches.fingerprint(MatchStatus.CONFIRMED).get(0)));
        key.addAll(java.util.Arrays.asList(friendly.fingerprint(FriendlyGameStatus.CONFIRMED).get(0)));
        Snapshot s = cache;
        if (s != null && s.key().equals(key)) {
            return s;
        }
        Map<GameSystem, List<RatedGame>> bySystem = new java.util.EnumMap<>(GameSystem.class);
        for (RatedGame g : load()) {
            bySystem.computeIfAbsent(g.system(), k -> new ArrayList<>()).add(g);
        }
        Map<GameSystem, List<RatedGame>> games = new java.util.EnumMap<>(GameSystem.class);
        Map<GameSystem, Map<UUID, Elo.Rating>> ratings = new java.util.EnumMap<>(GameSystem.class);
        bySystem.forEach((system, list) -> {
            games.put(system, List.copyOf(list));
            ratings.put(system, Map.copyOf(Elo.replay(list)));
        });
        s = new Snapshot(key, Map.copyOf(games), Map.copyOf(ratings));
        cache = s;
        return s;
    }

    private List<RatedGame> load() {
        List<RatedGame> games = new ArrayList<>();
        for (Object[] row : matches.playedGames(MatchStatus.CONFIRMED, MatchResultType.PLAYED)) {
            if (row[3] == null || row[4] == null) {
                continue;
            }
            GameSystem system = row[9] == null ? GameSystem.ELDFALL : (GameSystem) row[9];
            games.add(new RatedGame((UUID) row[0], (UUID) row[1], (UUID) row[2], (Integer) row[3], (Integer) row[4],
                    (Instant) row[5], (UUID) row[6], null, (Integer) row[7], (Integer) row[8], system));
        }
        for (FriendlyGame g : friendly.findByStatus(FriendlyGameStatus.CONFIRMED)) {
            // Noon UTC of the day played: after morning tournament rounds would be a guess either way.
            Instant at = g.getPlayedOn().atTime(12, 0).toInstant(ZoneOffset.UTC);
            games.add(new RatedGame(g.getId(), g.getPlayerA(), g.getPlayerB(), g.getSmallA(), g.getSmallB(), at,
                    null, g.getLeagueId()));
        }
        return games;
    }
}
