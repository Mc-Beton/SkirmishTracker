package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.pairing.KnockoutBracket;
import com.skirmishchronicle.pairing.PairingModels;
import com.skirmishchronicle.pairing.PairingModels.Pair;
import com.skirmishchronicle.pairing.PairingModels.Player;
import com.skirmishchronicle.pairing.RoundRobinSchedule;
import com.skirmishchronicle.pairing.SwissPairer;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.tournament.domain.RoundPairing;
import com.skirmishchronicle.tournament.domain.RoundPhase;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.TableOrder;
import com.skirmishchronicle.tournament.domain.Team;
import com.skirmishchronicle.tournament.domain.TeamMatch;
import com.skirmishchronicle.tournament.domain.TeamMember;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.TournamentRoundPlan;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.PenaltyRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.TeamMatchRepository;
import com.skirmishchronicle.tournament.repo.TeamMemberRepository;
import com.skirmishchronicle.tournament.repo.TeamRepository;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
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

/**
 * Rounds of a team tournament: teams are paired (Swiss, round robin or knockout, with the same round plan as
 * singles), every team match is split into individual games board by board (board 1 vs board 1 …). Captains set
 * the line-up while the round is only paired; the default is the order of the team roster.
 */
@Service
public class TeamRoundService {

    private static final String AUDIT_TYPE = "TOURNAMENT";

    public record TeamRef(UUID id, String name) {
    }

    /**
     * lineupA/lineupB: board order, null while hidden (before the round starts only the team itself and the
     * organizer see a line-up). winner: team that won (knockout: that advances), null for a draw or unfinished.
     */
    public record TeamMatchView(UUID id, int group, TeamRef teamA, TeamRef teamB, Integer seedA, Integer seedB,
                                List<RoundService.PlayerRef> lineupA, List<RoundService.PlayerRef> lineupB,
                                int gameWinsA, int gameWinsB, int bigA, int bigB, int smallA, int smallB,
                                boolean complete, UUID winner, boolean canEditLineupA, boolean canEditLineupB) {
    }

    public record TeamStandingRow(int position, UUID teamId, String name, int wins, int draws, int losses,
                                  int gameWins, int bigPoints, int penaltyPoints, int totalBigPoints,
                                  int smallPoints, int played, boolean dropped, boolean knockout,
                                  boolean eliminated) {
    }

    private final TeamRepository teams;
    private final TeamMemberRepository members;
    private final TeamMatchRepository teamMatches;
    private final MatchRepository matches;
    private final RoundRepository rounds;
    private final PenaltyRepository penalties;
    private final UserRepository users;
    private final RatingService ratings;
    private final TournamentGuard guard;
    private final NotificationService notifications;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public TeamRoundService(TeamRepository teams, TeamMemberRepository members, TeamMatchRepository teamMatches,
                            MatchRepository matches, RoundRepository rounds, PenaltyRepository penalties,
                            UserRepository users, RatingService ratings, TournamentGuard guard,
                            NotificationService notifications, AuditService audit) {
        this.teams = teams;
        this.members = members;
        this.teamMatches = teamMatches;
        this.matches = matches;
        this.rounds = rounds;
        this.penalties = penalties;
        this.users = users;
        this.ratings = ratings;
        this.guard = guard;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ used by RoundService

    /** Before round 1: at least two complete teams, every team that plays is complete; seeds for RR / knockout. */
    void prepareFirstRound(Tournament t, TournamentSettings settings) {
        List<Team> active = activeTeams(t.getId());
        if (active.size() < 2) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
        }
        Map<UUID, List<UUID>> roster = rosters(t.getId());
        for (Team team : active) {
            if (roster.getOrDefault(team.getId(), List.of()).size() != t.getTeamSize()) {
                throw new ApiException(HttpStatus.CONFLICT, "TEAM_INCOMPLETE");
            }
        }
        if (t.getFormat() != TournamentFormat.SWISS) {
            List<Team> order = new ArrayList<>(active);
            Collections.shuffle(order, random);
            if (settings.firstRoundMode() != PairingModels.FirstRoundMode.RANDOM) {
                Map<UUID, Integer> elo = averageElo(active, roster);
                order.sort(Comparator.comparingInt((Team x) -> elo.getOrDefault(x.getId(), RatingService.START))
                        .reversed());
            }
            for (int i = 0; i < order.size(); i++) {
                order.get(i).setSeed(i + 1);
            }
        }
    }

    /** Number of teams in the round-robin schedule (dropped teams keep their slot). */
    int roundRobinSize(UUID tournamentId) {
        return (int) teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId).stream()
                .filter(x -> x.getSeed() != null).count();
    }

    int teamMatchCount(UUID roundId) {
        return teamMatches.findByRoundIdOrderByGroupNumberAsc(roundId).size();
    }

    /** Pairs the teams of a new round and creates the team matches with their board games. */
    void pair(Tournament t, TournamentSettings settings, TournamentRound round, List<TournamentRound> existing,
              int number, RoundPhase phase, TournamentRoundPlan plan) {
        UUID tournamentId = t.getId();
        Map<UUID, List<UUID>> roster = rosters(tournamentId);
        Map<UUID, Team> byId = new HashMap<>();
        teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId).forEach(x -> byId.put(x.getId(), x));
        TableOrder order = plan != null ? plan.getTableOrder() : TableOrder.BY_STANDINGS;
        List<TeamMatch> created = new ArrayList<>();
        switch (phase) {
            case SWISS -> {
                List<Team> active = activeTeams(tournamentId);
                if (active.size() < 2) {
                    throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
                }
                RoundPairing pairing = plan != null && plan.getPairing() != null ? plan.getPairing()
                        : number == 1 ? RoundPairing.of(settings.firstRoundMode()) : RoundPairing.SWISS;
                boolean needElo = pairing == RoundPairing.ELO_STRONG_VS_STRONG
                        || pairing == RoundPairing.ELO_TOP_VS_BOTTOM;
                List<Player> players = teamPlayers(t, active, existing, roster, needElo);
                SwissPairer pairer = new SwissPairer(random);
                PairingModels.Result result;
                if (number == 1) {
                    result = pairer.pairFirstRound(players, pairing.asMode(), List.of(),
                            PairingModels.SoftPreferences.NONE);
                } else if (pairing == RoundPairing.SWISS) {
                    int after = t.getRoundsPlanned() == null ? 0 : t.getRoundsPlanned() - number;
                    result = pairer.pairRound(players, PairingModels.SoftPreferences.NONE, after);
                } else {
                    result = pairer.pairIgnoringResults(players, pairing.asMode(), PairingModels.SoftPreferences.NONE);
                }
                List<UUID> ranking = (number == 1 && needElo
                        ? players.stream().sorted(Comparator.comparingInt((Player p) -> p.elo() == null
                                ? RatingService.START : p.elo()).reversed()).toList()
                        : pairer.standingsOrder(players)).stream().map(Player::id).toList();
                round.setTableOrder(order);
                rounds.save(round);
                int group = 1;
                for (Pair p : orderPairs(result.pairs(), ranking, order)) {
                    created.add(new TeamMatch(round.getId(), tournamentId, group++, p.playerA(), p.playerB(), null, null));
                }
                if (result.bye() != null) {
                    created.add(new TeamMatch(round.getId(), tournamentId, group, result.bye(), null, null, null));
                }
            }
            case ROUND_ROBIN -> {
                List<Team> seeded = byId.values().stream().filter(x -> x.getSeed() != null)
                        .sorted(Comparator.comparingInt(Team::getSeed)).toList();
                int index = (int) existing.stream().filter(r -> r.getPhase() == RoundPhase.ROUND_ROBIN).count();
                Set<UUID> dropped = seeded.stream().filter(Team::isDropped).map(Team::getId).collect(Collectors.toSet());
                List<Pair> games = new ArrayList<>();
                List<UUID> byes = new ArrayList<>();
                for (Pair p : RoundRobinSchedule.round(seeded.stream().map(Team::getId).toList(), index)) {
                    boolean aOut = dropped.contains(p.playerA());
                    boolean bOut = p.playerB() == null || dropped.contains(p.playerB());
                    if (!aOut && !bOut) {
                        games.add(p);
                    } else if (!aOut) {
                        byes.add(p.playerA());
                    } else if (!bOut) {
                        byes.add(p.playerB());
                    }
                }
                List<UUID> ranking = groupStandings(t, existing, false).stream().map(r -> r.teamId).toList();
                round.setTableOrder(order);
                rounds.save(round);
                int group = 1;
                for (Pair p : orderPairs(games, ranking, order)) {
                    created.add(new TeamMatch(round.getId(), tournamentId, group++, p.playerA(), p.playerB(), null, null));
                }
                for (UUID bye : byes) {
                    created.add(new TeamMatch(round.getId(), tournamentId, group++, bye, null, null, null));
                }
            }
            case KNOCKOUT -> {
                rounds.save(round);
                for (KnockoutBracket.Match m : bracket(t, settings, existing, byId)) {
                    created.add(new TeamMatch(round.getId(), tournamentId, m.slot() + 1, m.a().player(),
                            m.b() == null ? null : m.b().player(), m.a().seed(), m.b() == null ? null : m.b().seed()));
                }
            }
        }
        for (TeamMatch tm : created) {
            tm.setLineup(tm.getTeamA(), roster.getOrDefault(tm.getTeamA(), List.of()));
            if (!tm.isBye()) {
                tm.setLineup(tm.getTeamB(), roster.getOrDefault(tm.getTeamB(), List.of()));
            }
            teamMatches.save(tm);
            createGames(tm, t.getTeamSize());
            // Captains may change the board order until the organizer starts the round.
            if (!tm.isBye()) {
                for (UUID teamId : List.of(tm.getTeamA(), tm.getTeamB())) {
                    Team own = byId.get(teamId);
                    Team other = byId.get(teamId.equals(tm.getTeamA()) ? tm.getTeamB() : tm.getTeamA());
                    notifications.notify(own.getCaptainId(), NotificationType.LINEUP_REQUIRED, Map.of(
                            "tournament", t.getName(), "round", number, "team", own.getName(),
                            "opponent", other.getName()), "/tournaments/" + tournamentId);
                }
            }
        }
    }

    private List<KnockoutBracket.Match> bracket(Tournament t, TournamentSettings settings,
                                                List<TournamentRound> existing, Map<UUID, Team> byId) {
        List<TournamentRound> ko = existing.stream().filter(r -> r.getPhase() == RoundPhase.KNOCKOUT).toList();
        Set<UUID> dropped = byId.values().stream().filter(Team::isDropped).map(Team::getId).collect(Collectors.toSet());
        if (ko.isEmpty()) {
            List<UUID> seeded;
            if (t.getFormat() == TournamentFormat.ELIMINATION) {
                seeded = byId.values().stream().filter(x -> x.getSeed() != null && !x.isDropped())
                        .sorted(Comparator.comparingInt(Team::getSeed)).map(Team::getId).toList();
            } else {
                seeded = groupStandings(t, existing, false).stream().map(r -> r.teamId)
                        .filter(id -> !dropped.contains(id)).limit(settings.topCut()).toList();
            }
            if (seeded.size() < 2) {
                throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
            }
            return KnockoutBracket.firstRound(seeded);
        }
        TournamentRound previous = ko.get(ko.size() - 1);
        List<KnockoutBracket.Match> next = KnockoutBracket.nextRound(played(t, previous, settings));
        return next.stream().map(m -> {
            if (m.b() != null && dropped.contains(m.a().player()) && !dropped.contains(m.b().player())) {
                return new KnockoutBracket.Match(m.slot(), m.b(), null);
            }
            if (m.b() != null && dropped.contains(m.b().player())) {
                return new KnockoutBracket.Match(m.slot(), m.a(), null);
            }
            return m;
        }).toList();
    }

    private List<KnockoutBracket.Played> played(Tournament t, TournamentRound round, TournamentSettings settings) {
        Map<UUID, UUID> teamOf = teamOfPlayer(t.getId());
        Map<UUID, List<TournamentMatch>> games = gamesByTeamMatch(matches.findByRoundIdOrderByTableNumberAsc(round.getId()));
        List<KnockoutBracket.Played> out = new ArrayList<>();
        for (TeamMatch tm : teamMatches.findByRoundIdOrderByGroupNumberAsc(round.getId())) {
            KnockoutBracket.Seeded a = new KnockoutBracket.Seeded(tm.getTeamA(), TeamScoring.seedOr(tm.getSeedA()));
            KnockoutBracket.Seeded b = tm.isBye() ? null
                    : new KnockoutBracket.Seeded(tm.getTeamB(), TeamScoring.seedOr(tm.getSeedB()));
            UUID winner = TeamScoring.aggregate(tm, games.getOrDefault(tm.getId(), List.of()), round, settings,
                    teamOf, true).winner();
            out.add(new KnockoutBracket.Played(tm.getGroupNumber() - 1, a, b, winner));
        }
        return out;
    }

    /** Board games of a team match: tables (group - 1) × size + 1 …; a BYE team gets a BYE on every board. */
    private void createGames(TeamMatch tm, int teamSize) {
        List<UUID> a = tm.lineup(tm.getTeamA());
        List<UUID> b = tm.isBye() ? List.of() : tm.lineup(tm.getTeamB());
        int base = (tm.getGroupNumber() - 1) * teamSize;
        int boards = Math.max(a.size(), b.size());
        for (int i = 0; i < boards; i++) {
            UUID pa = i < a.size() ? a.get(i) : null;
            UUID pb = i < b.size() ? b.get(i) : null;
            if (pa == null) {
                pa = pb;
                pb = null;
            }
            TournamentMatch m = new TournamentMatch(tm.getRoundId(), tm.getTournamentId(), base + i + 1, pa, pb);
            m.setTeamMatchId(tm.getId());
            matches.save(m);
        }
    }

    private List<Pair> orderPairs(List<Pair> pairs, List<UUID> ranking, TableOrder order) {
        List<Pair> out = new ArrayList<>(pairs);
        if (order == TableOrder.RANDOM) {
            Collections.shuffle(out, random);
            return out;
        }
        Map<UUID, Integer> rank = new HashMap<>();
        for (int i = 0; i < ranking.size(); i++) {
            rank.put(ranking.get(i), i);
        }
        out.sort(Comparator.comparingInt((Pair p) -> Math.min(rank.getOrDefault(p.playerA(), Integer.MAX_VALUE),
                rank.getOrDefault(p.playerB(), Integer.MAX_VALUE))));
        return out;
    }

    private List<Player> teamPlayers(Tournament t, List<Team> active, List<TournamentRound> existing,
                                     Map<UUID, List<UUID>> roster, boolean needElo) {
        Map<UUID, TeamScoring.Row> stats = new HashMap<>();
        for (TeamScoring.Row r : standingsRows(t, existing, active.stream().map(Team::getId).toList(), false)) {
            stats.put(r.teamId, r);
        }
        Map<UUID, Integer> elo = needElo ? averageElo(active, roster) : Map.of();
        List<Player> out = new ArrayList<>();
        for (Team team : active) {
            TeamScoring.Row r = stats.get(team.getId());
            out.add(new Player(team.getId(), r.wins, r.totalBig(), r.smallPoints, Set.copyOf(r.opponents), r.hadBye,
                    null, null, null, elo.get(team.getId())));
        }
        return out;
    }

    private Map<UUID, Integer> averageElo(List<Team> list, Map<UUID, List<UUID>> roster) {
        List<UUID> all = list.stream().flatMap(x -> roster.getOrDefault(x.getId(), List.of()).stream()).toList();
        Map<UUID, Integer> elo = ratings.current(all);
        Map<UUID, Integer> out = new HashMap<>();
        for (Team team : list) {
            List<UUID> ids = roster.getOrDefault(team.getId(), List.of());
            out.put(team.getId(), ids.isEmpty() ? RatingService.START : (int) Math.round(ids.stream()
                    .mapToInt(id -> elo.getOrDefault(id, RatingService.START)).average().orElse(RatingService.START)));
        }
        return out;
    }

    // ------------------------------------------------------------------ captains: line-up

    @Transactional
    public void setLineup(CurrentUser actor, UUID tournamentId, UUID teamMatchId, UUID teamId, List<UUID> order) {
        Tournament t = guard.lock(tournamentId);
        TeamMatch tm = teamMatches.findById(teamMatchId).filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TEAM_MATCH_NOT_FOUND"));
        if (!tm.involves(teamId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        Team team = teams.findById(teamId).orElseThrow();
        if (!TournamentGuard.canManage(actor, t) && !team.getCaptainId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        TournamentRound round = rounds.findById(tm.getRoundId()).orElseThrow();
        if (round.getStatus() != RoundStatus.PAIRED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_ALREADY_STARTED");
        }
        List<UUID> roster = rosters(tournamentId).getOrDefault(teamId, List.of());
        if (order.size() != roster.size() || !new HashSet<>(roster).equals(new HashSet<>(order))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LINEUP");
        }
        tm.setLineup(teamId, order);
        List<TournamentMatch> old = matches.findByRoundIdOrderByTableNumberAsc(round.getId()).stream()
                .filter(m -> tm.getId().equals(m.getTeamMatchId())).toList();
        matches.deleteAll(old);
        matches.flush();
        createGames(tm, t.getTeamSize());
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "LINEUP_SET", "#" + round.getNumber() + " " + team.getName());
    }

    // ------------------------------------------------------------------ reads

    /** Team matches per round id, as the viewer may see them. */
    Map<UUID, List<TeamMatchView>> views(Tournament t, List<TournamentRound> all, List<TournamentMatch> allMatches,
                                         CurrentUser viewer, boolean manager, Map<UUID, String> names) {
        UUID tournamentId = t.getId();
        TournamentSettings settings = t.settings();
        Map<UUID, Team> byId = new HashMap<>();
        teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId).forEach(x -> byId.put(x.getId(), x));
        Map<UUID, UUID> teamOf = teamOfPlayer(tournamentId);
        UUID myTeam = viewer == null ? null : teamOf.get(viewer.id());
        Map<UUID, List<TournamentMatch>> games = gamesByTeamMatch(allMatches);
        Map<UUID, TournamentRound> roundById = new HashMap<>();
        all.forEach(r -> roundById.put(r.getId(), r));
        Map<UUID, String> allNames = new HashMap<>(names);
        Set<UUID> missing = new HashSet<>();
        Map<UUID, List<TeamMatchView>> out = new HashMap<>();
        List<TeamMatch> list = teamMatches.findByTournamentId(tournamentId).stream()
                .sorted(Comparator.comparingInt(TeamMatch::getGroupNumber)).toList();
        for (TeamMatch tm : list) {
            missing.addAll(tm.lineup(tm.getTeamA()));
            if (!tm.isBye()) {
                missing.addAll(tm.lineup(tm.getTeamB()));
            }
        }
        missing.removeAll(allNames.keySet());
        users.findAllById(missing).forEach(u -> allNames.put(u.getId(), u.getDisplayName()));
        for (TeamMatch tm : list) {
            TournamentRound r = roundById.get(tm.getRoundId());
            if (r == null) {
                continue;
            }
            boolean paired = r.getStatus() == RoundStatus.PAIRED;
            TeamScoring.Aggregate g = TeamScoring.aggregate(tm, games.getOrDefault(tm.getId(), List.of()), r,
                    settings, teamOf, r.getPhase() == RoundPhase.KNOCKOUT);
            Team a = byId.get(tm.getTeamA());
            Team b = tm.isBye() ? null : byId.get(tm.getTeamB());
            boolean seeA = !paired || manager || tm.getTeamA().equals(myTeam);
            boolean seeB = b != null && (!paired || manager || tm.getTeamB().equals(myTeam));
            boolean editA = paired && viewer != null && (manager || a.getCaptainId().equals(viewer.id()));
            boolean editB = paired && b != null && viewer != null && (manager || b.getCaptainId().equals(viewer.id()));
            out.computeIfAbsent(tm.getRoundId(), k -> new ArrayList<>()).add(new TeamMatchView(tm.getId(),
                    tm.getGroupNumber(), new TeamRef(a.getId(), a.getName()),
                    b == null ? null : new TeamRef(b.getId(), b.getName()), tm.getSeedA(), tm.getSeedB(),
                    seeA ? refs(tm.lineup(tm.getTeamA()), allNames) : null,
                    seeB ? refs(tm.lineup(tm.getTeamB()), allNames) : null,
                    g.gameWinsA(), g.gameWinsB(), g.bigA(), g.bigB(), g.smallA(), g.smallB(), g.complete(), g.winner(),
                    editA, editB));
        }
        return out;
    }

    private static List<RoundService.PlayerRef> refs(List<UUID> ids, Map<UUID, String> names) {
        return ids.stream().map(id -> new RoundService.PlayerRef(id, names.getOrDefault(id, "?"))).toList();
    }

    @Transactional(readOnly = true)
    public List<TeamStandingRow> standings(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        if (!t.isTeamTournament()) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_TEAM_TOURNAMENT");
        }
        List<TournamentRound> all = rounds.findByTournamentIdOrderByNumberAsc(tournamentId);
        List<Team> list = teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId);
        Map<UUID, Team> byId = new HashMap<>();
        list.forEach(x -> byId.put(x.getId(), x));
        Map<UUID, TeamScoring.Row> stats = new HashMap<>();
        for (TeamScoring.Row r : standingsRows(t, all, byId.keySet(), true)) {
            stats.put(r.teamId, r);
        }
        List<UUID> groupOrder = groupStandings(t, all, true).stream().map(r -> r.teamId).toList();
        List<TeamStandingRow> out = new ArrayList<>();
        for (Placed p : placements(t, all, groupOrder)) {
            TeamScoring.Row r = stats.get(p.teamId());
            Team team = byId.get(p.teamId());
            if (r == null || team == null) {
                continue;
            }
            out.add(new TeamStandingRow(p.position(), team.getId(), team.getName(), r.wins, r.draws, r.losses,
                    r.gameWins, r.bigPoints, r.penaltyPoints, r.totalBig(), r.smallPoints, r.played, team.isDropped(),
                    p.knockout(), p.eliminated()));
        }
        return out;
    }

    private record Placed(UUID teamId, int position, boolean knockout, boolean eliminated) {
    }

    /** Same rules as singles: alive in the bracket by seed, knocked-out teams by round, then group standings. */
    private List<Placed> placements(Tournament t, List<TournamentRound> all, List<UUID> groupOrder) {
        List<TournamentRound> ko = all.stream().filter(r -> r.getPhase() == RoundPhase.KNOCKOUT)
                .filter(TeamScoring::counts).toList();
        List<Placed> out = new ArrayList<>();
        Set<UUID> placed = new HashSet<>();
        if (!ko.isEmpty()) {
            Map<UUID, UUID> teamOf = teamOfPlayer(t.getId());
            Map<UUID, List<TournamentMatch>> games = gamesByTeamMatch(matches.findByTournamentId(t.getId()));
            Map<UUID, Integer> seed = new HashMap<>();
            Map<UUID, Integer> lostAt = new HashMap<>();
            Set<UUID> inBracket = new HashSet<>();
            for (TournamentRound r : ko) {
                List<TeamMatch> rm = teamMatches.findByRoundIdOrderByGroupNumberAsc(r.getId());
                for (TeamMatch tm : rm) {
                    inBracket.add(tm.getTeamA());
                    if (tm.getSeedA() != null) {
                        seed.putIfAbsent(tm.getTeamA(), tm.getSeedA());
                    }
                    if (tm.isBye()) {
                        continue;
                    }
                    inBracket.add(tm.getTeamB());
                    if (tm.getSeedB() != null) {
                        seed.putIfAbsent(tm.getTeamB(), tm.getSeedB());
                    }
                    UUID w = TeamScoring.aggregate(tm, games.getOrDefault(tm.getId(), List.of()), r, t.settings(),
                            teamOf, true).winner();
                    if (w != null) {
                        lostAt.put(w.equals(tm.getTeamA()) ? tm.getTeamB() : tm.getTeamA(), rm.size() + 1);
                    }
                }
            }
            Comparator<UUID> bySeed = Comparator.comparingInt(id -> seed.getOrDefault(id, Integer.MAX_VALUE));
            List<UUID> alive = inBracket.stream().filter(id -> !lostAt.containsKey(id)).sorted(bySeed).toList();
            int pos = 1;
            for (UUID id : alive) {
                out.add(new Placed(id, pos++, true, false));
            }
            List<UUID> knocked = inBracket.stream().filter(lostAt::containsKey)
                    .sorted(Comparator.comparingInt((UUID id) -> lostAt.get(id)).thenComparing(bySeed)).toList();
            for (UUID id : knocked) {
                out.add(new Placed(id, Math.max(lostAt.get(id), alive.size() + 1), true, true));
            }
            placed.addAll(inBracket);
        }
        int pos = placed.size() + 1;
        for (UUID id : groupOrder) {
            if (placed.add(id)) {
                out.add(new Placed(id, pos++, false, false));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ helpers

    /** Standings over the group phase (Swiss / round robin); started rounds only when {@code startedOnly}. */
    private List<TeamScoring.Row> groupStandings(Tournament t, List<TournamentRound> all, boolean startedOnly) {
        List<TournamentRound> group = all.stream().filter(r -> r.getPhase() != RoundPhase.KNOCKOUT)
                .filter(r -> !startedOnly || TeamScoring.counts(r)).toList();
        List<UUID> ids = teams.findByTournamentIdOrderByCreatedAtAsc(t.getId()).stream().map(Team::getId).toList();
        return standingsRows(t, group, ids, false);
    }

    private List<TeamScoring.Row> standingsRows(Tournament t, List<TournamentRound> roundList, Collection<UUID> teamIds,
                                                boolean startedOnly) {
        Set<UUID> roundIds = roundList.stream().filter(r -> !startedOnly || TeamScoring.counts(r))
                .map(TournamentRound::getId).collect(Collectors.toSet());
        List<TeamMatch> tms = teamMatches.findByTournamentId(t.getId()).stream()
                .filter(tm -> roundIds.contains(tm.getRoundId())).toList();
        Map<UUID, List<TournamentMatch>> games = gamesByTeamMatch(matches.findByTournamentId(t.getId()));
        return TeamScoring.compute(teamIds, tms, games, roundList,
                penalties.findByTournamentIdOrderByCreatedAtAsc(t.getId()), teamOfPlayer(t.getId()), t.settings());
    }

    private static Map<UUID, List<TournamentMatch>> gamesByTeamMatch(List<TournamentMatch> list) {
        Map<UUID, List<TournamentMatch>> out = new HashMap<>();
        for (TournamentMatch m : list) {
            if (m.getTeamMatchId() != null) {
                out.computeIfAbsent(m.getTeamMatchId(), k -> new ArrayList<>()).add(m);
            }
        }
        return out;
    }

    private List<Team> activeTeams(UUID tournamentId) {
        return teams.findByTournamentIdOrderByCreatedAtAsc(tournamentId).stream().filter(x -> !x.isDropped()).toList();
    }

    /** Accepted members per team in roster order (board 1 first). */
    private Map<UUID, List<UUID>> rosters(UUID tournamentId) {
        Map<UUID, List<UUID>> out = new HashMap<>();
        members.findByTournamentId(tournamentId).stream().filter(TeamMember::isAccepted)
                .sorted(Comparator.comparingInt(TeamMember::getPosition))
                .forEach(m -> out.computeIfAbsent(m.getTeamId(), k -> new ArrayList<>()).add(m.getUserId()));
        return out;
    }

    private Map<UUID, UUID> teamOfPlayer(UUID tournamentId) {
        Map<UUID, UUID> out = new HashMap<>();
        members.findByTournamentId(tournamentId).stream().filter(TeamMember::isAccepted)
                .forEach(m -> out.put(m.getUserId(), m.getTeamId()));
        return out;
    }
}
