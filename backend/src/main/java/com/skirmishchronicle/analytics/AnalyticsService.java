package com.skirmishchronicle.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.friendly.FriendlyGame;
import com.skirmishchronicle.friendly.FriendlyGameRepository;
import com.skirmishchronicle.friendly.FriendlyGameStatus;
import com.skirmishchronicle.rating.Elo;
import com.skirmishchronicle.rating.RatedGame;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.Warband;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import com.skirmishchronicle.tournament.repo.WarbandRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds {@link SideFact}s from every rated game (confirmed tournament games and confirmed own games) and serves
 * meta reports for the publisher panel. Facts are rebuilt when the set of rated games changes, and at most every
 * few minutes otherwise (warband lists can be edited without a new result).
 */
@Service
public class AnalyticsService {

    private static final long MAX_AGE_MS = 5 * 60_000;

    /** What the panel needs besides the report: the choices for its filters. */
    public record MetaResponse(MetaReport report, List<String> countries, LocalDate firstGame, LocalDate lastGame,
                               Instant generatedAt) {
    }

    private record Cache(List<RatedGame> games, long builtAt, List<SideFact> facts) {
    }

    /** Faction and characters one player brought to a game. */
    private record Side(String faction, Set<String> units) {
        static final Side UNKNOWN = new Side(null, Set.of());
    }

    private final RatingService ratings;
    private final TournamentRepository tournaments;
    private final MatchRepository matches;
    private final RoundRepository rounds;
    private final WarbandRepository warbands;
    private final FriendlyGameRepository friendly;
    private final ObjectMapper mapper;
    private volatile Cache cache;

    public AnalyticsService(RatingService ratings, TournamentRepository tournaments, MatchRepository matches,
                            RoundRepository rounds, WarbandRepository warbands, FriendlyGameRepository friendly,
                            ObjectMapper mapper) {
        this.ratings = ratings;
        this.tournaments = tournaments;
        this.matches = matches;
        this.rounds = rounds;
        this.warbands = warbands;
        this.friendly = friendly;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public MetaResponse meta(MetaFilter filter) {
        List<SideFact> facts = facts();
        Set<String> countries = new TreeSet<>();
        LocalDate first = null;
        LocalDate last = null;
        for (SideFact f : facts) {
            if (f.country() != null) {
                countries.add(f.country());
            }
            first = first == null || f.playedOn().isBefore(first) ? f.playedOn() : first;
            last = last == null || f.playedOn().isAfter(last) ? f.playedOn() : last;
        }
        return new MetaResponse(MetaStats.compute(facts, filter), List.copyOf(countries), first, last,
                Instant.now());
    }

    @Transactional(readOnly = true)
    public List<SideFact> facts() {
        List<RatedGame> games = ratings.games();
        Cache c = cache;
        long now = System.currentTimeMillis();
        if (c != null && c.games() == games && now - c.builtAt() < MAX_AGE_MS) {
            return c.facts();
        }
        List<SideFact> facts = List.copyOf(build(games));
        cache = new Cache(games, now, facts);
        return facts;
    }

    private List<SideFact> build(List<RatedGame> games) {
        Map<UUID, Elo.PreGame> before = Elo.preGame(games);
        Set<UUID> tids = games.stream().map(RatedGame::tournamentId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Tournament> tournamentById = new HashMap<>();
        Map<String, Side> tournamentSides = new HashMap<>();
        Map<UUID, String> missionOfMatch = new HashMap<>();
        if (!tids.isEmpty()) {
            tournaments.findAllById(tids).forEach(t -> tournamentById.put(t.getId(), t));
            for (Warband w : warbands.findByTournamentIdIn(tids)) {
                tournamentSides.put(w.getTournamentId() + "/" + w.getUserId(),
                        new Side(w.getFaction(), warbandUnits(w.getUnits())));
            }
            List<TournamentMatch> ms = matches.findByTournamentIdIn(tids);
            Map<UUID, String> scenarioOfRound = new HashMap<>();
            rounds.findAllById(ms.stream().map(TournamentMatch::getRoundId).collect(Collectors.toSet()))
                    .forEach(r -> {
                        if (r.getScenarioCode() != null) {
                            scenarioOfRound.put(r.getId(), r.getScenarioCode());
                        }
                    });
            ms.forEach(m -> {
                String sc = scenarioOfRound.get(m.getRoundId());
                if (sc != null) {
                    missionOfMatch.put(m.getId(), sc);
                }
            });
        }
        Map<UUID, FriendlyGame> own = new HashMap<>();
        for (FriendlyGame g : friendly.findByStatus(FriendlyGameStatus.CONFIRMED)) {
            own.put(g.getId(), g);
        }

        List<SideFact> out = new ArrayList<>();
        for (RatedGame g : games) {
            Elo.PreGame pre = before.get(g.id());
            Side a;
            Side b;
            SideFact.Source source;
            String mission;
            String country = null;
            String tier = null;
            LocalDate day;
            if (g.tournamentId() != null) {
                Tournament t = tournamentById.get(g.tournamentId());
                source = SideFact.Source.TOURNAMENT;
                a = tournamentSides.getOrDefault(g.tournamentId() + "/" + g.playerA(), Side.UNKNOWN);
                b = tournamentSides.getOrDefault(g.tournamentId() + "/" + g.playerB(), Side.UNKNOWN);
                mission = missionOfMatch.get(g.id());
                if (t != null) {
                    country = t.getCountry();
                    tier = t.getRank() == null ? null : t.getRank().name();
                }
                Instant at = g.playedAt() != null ? g.playedAt() : t != null ? t.getStartsAt() : null;
                if (at == null) {
                    continue;
                }
                day = LocalDate.ofInstant(at, ZoneOffset.UTC);
            } else {
                FriendlyGame f = own.get(g.id());
                if (f == null) {
                    continue;
                }
                source = SideFact.Source.OWN;
                a = friendlySide(f.getFactionA(), f.getListA());
                b = friendlySide(f.getFactionB(), f.getListB());
                mission = f.getScenarioCode();
                day = f.getPlayedOn();
            }
            double sa = g.scoreA();
            out.add(new SideFact(g.id(), g.playerA(), g.playerB(), day, source, g.tournamentId(), country, tier,
                    a.faction(), b.faction(), a.units(), mission, pre.a(), pre.b(), sa, g.smallA(), g.smallB()));
            out.add(new SideFact(g.id(), g.playerB(), g.playerA(), day, source, g.tournamentId(), country, tier,
                    b.faction(), a.faction(), b.units(), mission, pre.b(), pre.a(), 1.0 - sa, g.smallB(),
                    g.smallA()));
        }
        return out;
    }

    private Side friendlySide(String faction, String listJson) {
        if (listJson == null) {
            return faction == null ? Side.UNKNOWN : new Side(faction, Set.of());
        }
        try {
            JsonNode node = mapper.readTree(listJson);
            Set<String> set = new HashSet<>();
            node.path("units").forEach(u -> set.add(u.path("unit").asText()));
            String f = node.path("faction").asText(null);
            return new Side(f != null ? f : faction, Set.copyOf(set));
        } catch (JsonProcessingException e) {
            return new Side(faction, Set.of());
        }
    }

    private Set<String> warbandUnits(String warbandJson) {
        Set<String> set = new HashSet<>();
        if (warbandJson == null) {
            return set;
        }
        try {
            mapper.readTree(warbandJson).forEach(u -> set.add(u.path("unit").asText()));
        } catch (JsonProcessingException e) {
            // unreadable list: treat as unknown
        }
        return Set.copyOf(set);
    }
}
