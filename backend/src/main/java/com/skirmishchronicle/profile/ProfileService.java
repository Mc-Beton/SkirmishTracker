package com.skirmishchronicle.profile;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.friendly.FriendlyGame;
import com.skirmishchronicle.friendly.FriendlyGameRepository;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.league.LeagueService;
import com.skirmishchronicle.rating.Elo;
import com.skirmishchronicle.rating.RatedGame;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.domain.Warband;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import com.skirmishchronicle.tournament.repo.WarbandRepository;
import com.skirmishchronicle.tournament.service.RoundService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Public player profiles, the global ELO ranking and player search (for reporting own games). */
@Service
public class ProfileService {

    private static final int HISTORY = 40;
    private static final int RECENT = 10;

    public record PlayerRef(UUID id, String displayName) {
    }

    public record Stats(int elo, Integer rank, int games, int wins, int draws, int losses) {
    }

    public record TournamentEntry(UUID id, String name, Instant startsAt, TournamentStatus status,
                                  TournamentFormat format, long players, Integer position) {
    }

    public record GameEntry(UUID id, Instant playedAt, PlayerRef opponent, int myScore, int opponentScore,
                            String result, int eloChange, UUID tournamentId, String tournamentName) {
    }

    public record FactionCount(String faction, int count) {
    }

    public record Profile(UUID id, String displayName, String club, String city, Instant memberSince, Stats stats,
                          List<Elo.Point> history, List<TournamentEntry> tournaments,
                          List<LeagueService.PlayerLeague> leagues, List<GameEntry> recentGames,
                          List<FactionCount> factions, PlayStats playStats) {
    }

    /** key: faction or character code. */
    public record Count(String key, int count) {
    }

    /**
     * Statistics over rated games where the faction / list is known: tournament games use the player's tournament
     * warband, own games the factions and lists entered with the game.
     */
    public record PlayStats(int games, int gamesWithFaction, int gamesWithList, List<Count> topUnits,
                            List<Count> topWinningUnits, List<Count> nemesisUnits, List<Count> factions,
                            List<Count> factionWins, List<Count> factionLosses, List<Count> opponentFactions,
                            List<Count> winsAgainst, List<Count> lossesAgainst, int gamesWithMission,
                            List<Count> missions, List<Count> missionWins, List<Count> missionLosses) {
    }

    private static final int TOP = 5;

    public record RankingRow(int position, UUID id, String displayName, String club, int elo, int games, int wins,
                             int draws, int losses) {
    }

    public record SearchHit(UUID id, String displayName, String club) {
    }

    private final UserRepository users;
    private final RatingService ratings;
    private final ParticipantRepository participants;
    private final TournamentRepository tournaments;
    private final RoundRepository rounds;
    private final WarbandRepository warbands;
    private final RoundService roundService;
    private final LeagueService leagueService;
    private final FriendlyGameRepository friendly;
    private final com.skirmishchronicle.tournament.repo.MatchRepository matches;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public ProfileService(UserRepository users, RatingService ratings, ParticipantRepository participants,
                          TournamentRepository tournaments, RoundRepository rounds, WarbandRepository warbands,
                          RoundService roundService, LeagueService leagueService, FriendlyGameRepository friendly,
                          com.skirmishchronicle.tournament.repo.MatchRepository matches,
                          com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.users = users;
        this.ratings = ratings;
        this.participants = participants;
        this.tournaments = tournaments;
        this.rounds = rounds;
        this.warbands = warbands;
        this.roundService = roundService;
        this.leagueService = leagueService;
        this.friendly = friendly;
        this.matches = matches;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public Profile profile(UUID userId) {
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND"));
        Map<UUID, Elo.Rating> all = ratings.ratings();
        Elo.Rating mine = all.get(userId);
        Stats stats;
        List<Elo.Point> history = List.of();
        if (mine == null) {
            stats = new Stats(Elo.START, null, 0, 0, 0, 0);
        } else {
            int rank = 1 + (int) all.values().stream().filter(r -> r.rounded() > mine.rounded()).count();
            stats = new Stats(mine.rounded(), rank, mine.games, mine.wins, mine.draws, mine.losses);
            List<Elo.Point> h = mine.history;
            history = h.subList(Math.max(0, h.size() - HISTORY), h.size());
        }
        return new Profile(u.getId(), u.getDisplayName(), u.getClub(), u.getHomeCity(), u.getCreatedAt(), stats,
                history, tournamentsOf(userId), leagueService.ofPlayer(userId), recentGames(userId, mine),
                factions(userId), playStats(userId));
    }

    @Transactional(readOnly = true)
    public List<RankingRow> ranking(int limit) {
        Map<UUID, Elo.Rating> all = ratings.ratings();
        List<Map.Entry<UUID, Elo.Rating>> sorted = new ArrayList<>(all.entrySet());
        sorted.sort(Comparator.comparingDouble((Map.Entry<UUID, Elo.Rating> e) -> e.getValue().value).reversed());
        List<Map.Entry<UUID, Elo.Rating>> top = sorted.subList(0, Math.min(limit, sorted.size()));
        Map<UUID, User> byId = users.findAllById(top.stream().map(Map.Entry::getKey).toList()).stream()
                .collect(Collectors.toMap(User::getId, x -> x));
        List<RankingRow> out = new ArrayList<>();
        int position = 0;
        Integer prev = null;
        for (int i = 0; i < top.size(); i++) {
            Elo.Rating r = top.get(i).getValue();
            if (prev == null || prev != r.rounded()) {
                position = i + 1;
            }
            prev = r.rounded();
            User u = byId.get(top.get(i).getKey());
            if (u == null) {
                continue;
            }
            out.add(new RankingRow(position, u.getId(), u.getDisplayName(), u.getClub(), r.rounded(), r.games, r.wins,
                    r.draws, r.losses));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<SearchHit> search(String query) {
        String q = query == null ? "" : query.strip();
        if (q.length() < 2) {
            return List.of();
        }
        return users.findTop10ByDisplayNameContainingIgnoreCaseOrderByDisplayNameAsc(q).stream()
                .map(u -> new SearchHit(u.getId(), u.getDisplayName(), u.getClub())).toList();
    }

    // ------------------------------------------------------------------ helpers

    private List<TournamentEntry> tournamentsOf(UUID userId) {
        Set<UUID> ids = participants.findByUserId(userId).stream()
                .filter(p -> p.getStatus() == ParticipantStatus.REGISTERED)
                .map(TournamentParticipant::getTournamentId).collect(Collectors.toSet());
        List<TournamentEntry> out = new ArrayList<>();
        for (Tournament t : tournaments.findAllById(ids)) {
            if (!t.getStatus().isPublic() || t.getStatus() == TournamentStatus.CANCELLED) {
                continue;
            }
            Integer position = null;
            if (rounds.countByTournamentId(t.getId()) > 0) {
                position = roundService.standings(null, t.getId()).rows().stream()
                        .filter(r -> r.userId().equals(userId)).map(RoundService.StandingRow::position)
                        .findFirst().orElse(null);
            }
            out.add(new TournamentEntry(t.getId(), t.getName(), t.getStartsAt(), t.getStatus(), t.getFormat(),
                    participants.countByTournamentIdAndStatus(t.getId(), ParticipantStatus.REGISTERED), position));
        }
        out.sort(Comparator.comparing(TournamentEntry::startsAt).reversed());
        return out;
    }

    private List<GameEntry> recentGames(UUID userId, Elo.Rating mine) {
        Map<UUID, Integer> change = new HashMap<>();
        if (mine != null) {
            mine.history.forEach(p -> change.put(p.gameId(), p.change()));
        }
        List<RatedGame> games = ratings.games().stream()
                .filter(g -> g.playerA().equals(userId) || g.playerB().equals(userId))
                .sorted(Comparator.comparing(RatedGame::playedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .reversed())
                .limit(RECENT).toList();
        Set<UUID> people = new HashSet<>();
        Set<UUID> tids = new HashSet<>();
        for (RatedGame g : games) {
            people.add(g.playerA().equals(userId) ? g.playerB() : g.playerA());
            if (g.tournamentId() != null) {
                tids.add(g.tournamentId());
            }
        }
        Map<UUID, String> names = users.findAllById(people).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName));
        Map<UUID, String> tnames = tournaments.findAllById(tids).stream()
                .collect(Collectors.toMap(Tournament::getId, Tournament::getName));
        return games.stream().map(g -> {
            boolean a = g.playerA().equals(userId);
            UUID opp = a ? g.playerB() : g.playerA();
            int my = a ? g.smallA() : g.smallB();
            int their = a ? g.smallB() : g.smallA();
            String result = my > their ? "W" : my == their ? "D" : "L";
            return new GameEntry(g.id(), g.playedAt(), new PlayerRef(opp, names.getOrDefault(opp, "?")), my, their,
                    result, change.getOrDefault(g.id(), 0), g.tournamentId(),
                    g.tournamentId() == null ? null : tnames.get(g.tournamentId()));
        }).toList();
    }

    /** What one side brought to a game. */
    private record Side(String faction, Set<String> units) {
        static final Side UNKNOWN = new Side(null, Set.of());
    }

    PlayStats playStats(UUID userId) {
        List<RatedGame> games = ratings.games().stream()
                .filter(g -> g.playerA().equals(userId) || g.playerB().equals(userId)).toList();
        // Tournament warbands of both players, keyed by tournament + player.
        Set<UUID> tids = games.stream().map(RatedGame::tournamentId).filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, Side> tournamentSides = new HashMap<>();
        if (!tids.isEmpty()) {
            for (Warband w : warbands.findByTournamentIdIn(tids)) {
                tournamentSides.put(w.getTournamentId() + "/" + w.getUserId(), new Side(w.getFaction(), unitsOf(w.getUnits())));
            }
        }
        Map<UUID, FriendlyGame> own = friendly.findForPlayer(userId).stream()
                .collect(Collectors.toMap(FriendlyGame::getId, g -> g));
        // Mission (scenario) of each tournament game = the scenario the organizer set for its round.
        Map<UUID, String> missionOfMatch = new HashMap<>();
        if (!tids.isEmpty()) {
            List<com.skirmishchronicle.tournament.domain.TournamentMatch> ms = matches.findByTournamentIdIn(tids);
            Map<UUID, String> scenarioOfRound = new HashMap<>();
            rounds.findAllById(ms.stream().map(com.skirmishchronicle.tournament.domain.TournamentMatch::getRoundId)
                    .collect(Collectors.toSet())).forEach(r -> {
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
        Map<String, Integer> missions = new HashMap<>();
        Map<String, Integer> missionWins = new HashMap<>();
        Map<String, Integer> missionLosses = new HashMap<>();
        int withMission = 0;

        Map<String, Integer> units = new HashMap<>();
        Map<String, Integer> winningUnits = new HashMap<>();
        Map<String, Integer> nemesis = new HashMap<>();
        Map<String, Integer> factions = new HashMap<>();
        Map<String, Integer> factionWins = new HashMap<>();
        Map<String, Integer> factionLosses = new HashMap<>();
        Map<String, Integer> opponents = new HashMap<>();
        Map<String, Integer> winsAgainst = new HashMap<>();
        Map<String, Integer> lossesAgainst = new HashMap<>();
        int withFaction = 0;
        int withList = 0;
        for (RatedGame g : games) {
            boolean a = g.playerA().equals(userId);
            UUID opponent = a ? g.playerB() : g.playerA();
            int my = a ? g.smallA() : g.smallB();
            int their = a ? g.smallB() : g.smallA();
            Side me;
            Side them;
            String mission;
            if (g.tournamentId() != null) {
                mission = missionOfMatch.get(g.id());
                me = tournamentSides.getOrDefault(g.tournamentId() + "/" + userId, Side.UNKNOWN);
                them = tournamentSides.getOrDefault(g.tournamentId() + "/" + opponent, Side.UNKNOWN);
            } else {
                FriendlyGame f = own.get(g.id());
                if (f == null) {
                    continue;
                }
                mission = f.getScenarioCode();
                boolean mineA = f.getPlayerA().equals(userId);
                me = friendlySide(mineA ? f.getFactionA() : f.getFactionB(), mineA ? f.getListA() : f.getListB());
                them = friendlySide(mineA ? f.getFactionB() : f.getFactionA(), mineA ? f.getListB() : f.getListA());
            }
            boolean won = my > their;
            boolean lost = my < their;
            if (mission != null) {
                withMission++;
                missions.merge(mission, 1, Integer::sum);
                if (won) {
                    missionWins.merge(mission, 1, Integer::sum);
                }
                if (lost) {
                    missionLosses.merge(mission, 1, Integer::sum);
                }
            }
            if (me.faction() != null) {
                withFaction++;
                factions.merge(me.faction(), 1, Integer::sum);
                if (won) {
                    factionWins.merge(me.faction(), 1, Integer::sum);
                }
                if (lost) {
                    factionLosses.merge(me.faction(), 1, Integer::sum);
                }
            }
            if (them.faction() != null) {
                opponents.merge(them.faction(), 1, Integer::sum);
                if (won) {
                    winsAgainst.merge(them.faction(), 1, Integer::sum);
                }
                if (lost) {
                    lossesAgainst.merge(them.faction(), 1, Integer::sum);
                }
            }
            if (!me.units().isEmpty()) {
                withList++;
            }
            for (String u : me.units()) {
                units.merge(u, 1, Integer::sum);
                if (won) {
                    winningUnits.merge(u, 1, Integer::sum);
                }
            }
            if (lost) {
                them.units().forEach(u -> nemesis.merge(u, 1, Integer::sum));
            }
        }
        return new PlayStats(games.size(), withFaction, withList, top(units, TOP), top(winningUnits, TOP),
                top(nemesis, TOP), top(factions, 0), top(factionWins, 0), top(factionLosses, 0), top(opponents, 0),
                top(winsAgainst, 0), top(lossesAgainst, 0), withMission, top(missions, 0), top(missionWins, TOP),
                top(missionLosses, TOP));
    }

    /** Sorted by count (desc), then key; {@code limit} 0 = all. */
    private static List<Count> top(Map<String, Integer> counts, int limit) {
        var stream = counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .map(e -> new Count(e.getKey(), e.getValue()));
        return (limit > 0 ? stream.limit(limit) : stream).toList();
    }

    private Side friendlySide(String faction, String listJson) {
        if (listJson == null) {
            return faction == null ? Side.UNKNOWN : new Side(faction, Set.of());
        }
        try {
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(listJson);
            Set<String> set = new HashSet<>();
            node.path("units").forEach(u -> set.add(u.path("unit").asText()));
            String f = node.path("faction").asText(null);
            return new Side(f != null ? f : faction, set);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return new Side(faction, Set.of());
        }
    }

    private Set<String> unitsOf(String warbandJson) {
        Set<String> set = new HashSet<>();
        try {
            mapper.readTree(warbandJson).forEach(u -> set.add(u.path("unit").asText()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            // ignore unreadable lists
        }
        return set;
    }

    private List<FactionCount> factions(UUID userId) {
        Map<String, Integer> counts = new HashMap<>();
        for (Warband w : warbands.findByUserId(userId)) {
            counts.merge(w.getFaction(), 1, Integer::sum);
        }
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(e -> new FactionCount(e.getKey(), e.getValue())).toList();
    }
}
