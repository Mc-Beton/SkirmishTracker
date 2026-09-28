package com.skirmishchronicle.rating;

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
 * Global ELO: replays every confirmed, played tournament game and every confirmed own game in chronological
 * order (tournament games by round start, own games by the day they were played). The result is cached until a
 * new game is confirmed or a result is corrected.
 */
@Service
public class RatingService {

    public static final int START = Elo.START;

    private record Snapshot(List<Object> key, List<RatedGame> games, Map<UUID, Elo.Rating> ratings) {
    }

    private final MatchRepository matches;
    private final FriendlyGameRepository friendly;
    private volatile Snapshot cache;

    public RatingService(MatchRepository matches, FriendlyGameRepository friendly) {
        this.matches = matches;
        this.friendly = friendly;
    }

    /** All rated games (tournament + own), unordered. */
    @Transactional(readOnly = true)
    public List<RatedGame> games() {
        return snapshot().games();
    }

    /** Global ratings of everybody who played at least one rated game. */
    @Transactional(readOnly = true)
    public Map<UUID, Elo.Rating> ratings() {
        return snapshot().ratings();
    }

    /** Rounded current rating per player; players without games get {@link #START}. */
    @Transactional(readOnly = true)
    public Map<UUID, Integer> current(Collection<UUID> ids) {
        Map<UUID, Elo.Rating> all = ratings();
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
        List<RatedGame> games = load();
        s = new Snapshot(key, List.copyOf(games), Map.copyOf(Elo.replay(games)));
        cache = s;
        return s;
    }

    private List<RatedGame> load() {
        List<RatedGame> games = new ArrayList<>();
        for (Object[] row : matches.playedGames(MatchStatus.CONFIRMED, MatchResultType.PLAYED)) {
            if (row[3] == null || row[4] == null) {
                continue;
            }
            games.add(new RatedGame((UUID) row[0], (UUID) row[1], (UUID) row[2], (Integer) row[3], (Integer) row[4],
                    (Instant) row[5], (UUID) row[6], null));
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
