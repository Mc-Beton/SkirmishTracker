package com.skirmishchronicle.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.content.ArmyContent;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.friendly.FriendlyGame;
import com.skirmishchronicle.friendly.FriendlyGameRepository;
import com.skirmishchronicle.friendly.FriendlyGameStatus;
import com.skirmishchronicle.rating.Elo;
import com.skirmishchronicle.rating.RatedGame;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.tournament.domain.MatchSchemeDraw;
import com.skirmishchronicle.tournament.domain.MatchTurnScore;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.Warband;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.SchemeDrawRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import com.skirmishchronicle.tournament.repo.TurnScoreRepository;
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

    /** Faction, characters and items one player brought to a game. */
    private record Side(String faction, Set<String> units, List<SideFact.ItemUse> items, int unitPoints,
                        int itemPoints) {
        static final Side UNKNOWN = new Side(null, Set.of(), List.of(), 0, 0);

        static Side factionOnly(String faction) {
            return faction == null ? UNKNOWN : new Side(faction, Set.of(), List.of(), 0, 0);
        }
    }

    private final RatingService ratings;
    private final TournamentRepository tournaments;
    private final MatchRepository matches;
    private final RoundRepository rounds;
    private final WarbandRepository warbands;
    private final FriendlyGameRepository friendly;
    private final ObjectMapper mapper;
    private final TurnScoreRepository turnScores;
    private final SchemeDrawRepository schemeDraws;
    private final Map<String, ArmyContent.Unit> unitByCode = new HashMap<>();
    private final Map<String, ArmyContent.Item> itemByCode = new HashMap<>();
    private volatile Cache cache;

    public AnalyticsService(RatingService ratings, TournamentRepository tournaments, MatchRepository matches,
                            RoundRepository rounds, WarbandRepository warbands, FriendlyGameRepository friendly,
                            ObjectMapper mapper, ContentService content, TurnScoreRepository turnScores,
                            SchemeDrawRepository schemeDraws) {
        this.turnScores = turnScores;
        this.schemeDraws = schemeDraws;
        this.ratings = ratings;
        this.tournaments = tournaments;
        this.matches = matches;
        this.rounds = rounds;
        this.warbands = warbands;
        this.friendly = friendly;
        this.mapper = mapper;
        content.armies().units().forEach(u -> unitByCode.put(u.code(), u));
        content.armies().items().forEach(i -> itemByCode.put(i.code(), i));
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
        Map<String, List<SideFact.TurnVp>> turnsOf = new HashMap<>();
        Map<String, MatchSchemeDraw> drawOf = new HashMap<>();
        if (!tids.isEmpty()) {
            tournaments.findAllById(tids).forEach(t -> tournamentById.put(t.getId(), t));
            for (Warband w : warbands.findByTournamentIdIn(tids)) {
                tournamentSides.put(w.getTournamentId() + "/" + w.getUserId(),
                        side(w.getFaction(), readTree(w.getUnits())));
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
            Set<UUID> matchIds = ms.stream().map(TournamentMatch::getId).collect(Collectors.toSet());
            for (MatchTurnScore t : turnScores.findByMatchIdIn(matchIds)) {
                turnsOf.computeIfAbsent(t.getMatchId() + "/" + t.getUserId(), k -> new ArrayList<>())
                        .add(new SideFact.TurnVp(t.getTurn(), t.getScenarioVp(), t.getSchemeVp()));
            }
            for (MatchSchemeDraw d : schemeDraws.findByMatchIdIn(matchIds)) {
                drawOf.put(d.getMatchId() + "/" + d.getUserId(), d);
            }
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
            String keyA = g.id() + "/" + g.playerA();
            String keyB = g.id() + "/" + g.playerB();
            out.add(new SideFact(g.id(), g.playerA(), g.playerB(), day, source, g.tournamentId(), country, tier,
                    a.faction(), b.faction(), a.units(), mission, pre.a(), pre.b(), sa, g.smallA(), g.smallB(),
                    a.items(), a.unitPoints(), a.itemPoints(), turns(turnsOf.get(keyA)), drawn(drawOf.get(keyA)),
                    kept(drawOf.get(keyA))));
            out.add(new SideFact(g.id(), g.playerB(), g.playerA(), day, source, g.tournamentId(), country, tier,
                    b.faction(), a.faction(), b.units(), mission, pre.b(), pre.a(), 1.0 - sa, g.smallB(),
                    g.smallA(), b.items(), b.unitPoints(), b.itemPoints(), turns(turnsOf.get(keyB)),
                    drawn(drawOf.get(keyB)), kept(drawOf.get(keyB))));
        }
        return out;
    }

    private static List<SideFact.TurnVp> turns(List<SideFact.TurnVp> list) {
        if (list == null) {
            return List.of();
        }
        List<SideFact.TurnVp> sorted = new ArrayList<>(list);
        sorted.sort(java.util.Comparator.comparingInt(SideFact.TurnVp::turn));
        return List.copyOf(sorted);
    }

    private static List<String> drawn(MatchSchemeDraw d) {
        return d == null ? List.of() : d.getCards().stream().map(MatchSchemeDraw.Card::scheme).toList();
    }

    private static String kept(MatchSchemeDraw d) {
        return d == null ? null : d.getKeptCode();
    }

    /** Own-game list: {"faction", "units": [...]}, or only the faction field when no list was entered. */
    private Side friendlySide(String faction, String listJson) {
        JsonNode node = readTree(listJson);
        if (node == null) {
            return Side.factionOnly(faction);
        }
        String f = node.path("faction").asText(null);
        return side(f != null ? f : faction, node.path("units"));
    }

    private JsonNode readTree(String json) {
        if (json == null) {
            return null;
        }
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            return null; // unreadable list: treated as unknown
        }
    }

    /** Units array of a tournament warband or an own-game list: [{unit, leader, items: [{item, reduced}]}]. */
    private Side side(String faction, JsonNode unitsNode) {
        if (unitsNode == null || !unitsNode.isArray()) {
            return Side.factionOnly(faction);
        }
        Set<String> units = new HashSet<>();
        List<SideFact.ItemUse> items = new ArrayList<>();
        int unitPoints = 0;
        int itemPoints = 0;
        for (JsonNode u : unitsNode) {
            String code = u.path("unit").asText();
            boolean leader = u.path("leader").asBoolean(false);
            units.add(code);
            ArmyContent.Unit unit = unitByCode.get(code);
            unitPoints += unit == null ? 0 : unit.points();
            for (JsonNode i : u.path("items")) {
                String itemCode = i.path("item").asText();
                boolean reduced = i.path("reduced").asBoolean(false);
                items.add(new SideFact.ItemUse(itemCode, code, leader, reduced));
                ArmyContent.Item item = itemByCode.get(itemCode);
                if (item != null) {
                    itemPoints += reduced && item.reducedPoints() != null ? item.reducedPoints() : item.points();
                }
            }
        }
        return new Side(faction, Set.copyOf(units), List.copyOf(items), unitPoints, itemPoints);
    }
}
