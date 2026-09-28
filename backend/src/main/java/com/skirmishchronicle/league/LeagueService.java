package com.skirmishchronicle.league;

import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.friendly.FriendlyGame;
import com.skirmishchronicle.friendly.FriendlyGameRepository;
import com.skirmishchronicle.friendly.FriendlyGameStatus;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.rating.Elo;
import com.skirmishchronicle.rating.RatedGame;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import com.skirmishchronicle.tournament.service.RoundService;
import com.skirmishchronicle.tournament.service.TournamentGuard;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leagues: anybody can start one; tournament organizers submit their tournaments and the league owner accepts
 * them. Only finished tournaments count. Own games count in leagues that allow them, when both players are
 * members. Table modes: points for place × rank multiplier, big points × multiplier, or a league ELO.
 */
@Service
public class LeagueService {

    private static final String AUDIT_TYPE = "LEAGUE";

    public record PlayerRef(UUID id, String displayName) {
    }

    public record Summary(UUID id, String name, String city, LocalDate startsOn, LocalDate endsOn,
                          LeagueScoringMode scoringMode, PlayerRef owner, long members, long tournaments,
                          boolean active) {
    }

    public record TournamentLink(UUID id, String name, Instant startsAt, TournamentRank rank,
                                 TournamentStatus tournamentStatus, LeagueTournamentStatus status, boolean counted) {
    }

    /** points: league points (place / big-points modes) or rating (ELO mode). */
    public record StandingRow(int position, UUID userId, String displayName, BigDecimal points, int tournaments,
                              int games, int wins, int draws, int losses, int smallPoints) {
    }

    public record Detail(UUID id, League.Settings settings, PlayerRef owner, boolean canManage, boolean member,
                         List<PlayerRef> members, List<TournamentLink> tournaments, List<StandingRow> standings) {
    }

    private final NotificationService notifications;
    private final LeagueRepository leagues;
    private final LeagueMemberRepository members;
    private final LeagueTournamentRepository links;
    private final TournamentRepository tournaments;
    private final FriendlyGameRepository friendly;
    private final UserRepository users;
    private final RoundService roundService;
    private final RatingService ratings;
    private final AuditService audit;

    public LeagueService(LeagueRepository leagues, LeagueMemberRepository members, LeagueTournamentRepository links,
                         TournamentRepository tournaments, FriendlyGameRepository friendly, UserRepository users,
                         RoundService roundService, RatingService ratings, AuditService audit,
            NotificationService notifications) {
        this.notifications = notifications;
        this.leagues = leagues;
        this.members = members;
        this.links = links;
        this.tournaments = tournaments;
        this.friendly = friendly;
        this.users = users;
        this.roundService = roundService;
        this.ratings = ratings;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public List<Summary> list() {
        List<League> all = leagues.findAllByOrderByStartsOnDesc();
        Map<UUID, String> names = names(all.stream().map(League::getOwnerId).collect(Collectors.toSet()));
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return all.stream().map(l -> new Summary(l.getId(), l.getName(), l.getCity(), l.getStartsOn(), l.getEndsOn(),
                l.getScoringMode(), new PlayerRef(l.getOwnerId(), names.getOrDefault(l.getOwnerId(), "?")),
                members.countByLeagueId(l.getId()),
                links.findByLeagueId(l.getId()).stream()
                        .filter(x -> x.getStatus() == LeagueTournamentStatus.ACCEPTED).count(),
                l.covers(today))).toList();
    }

    @Transactional(readOnly = true)
    public Detail detail(CurrentUser viewer, UUID id) {
        League l = find(id);
        boolean manage = canManage(viewer, l);
        List<LeagueMember> ms = members.findByLeagueIdOrderByJoinedAtAsc(id);
        List<LeagueTournament> ls = links.findByLeagueId(id);
        Map<UUID, Tournament> ts = tournaments.findAllById(ls.stream().map(LeagueTournament::getTournamentId).toList())
                .stream().collect(Collectors.toMap(Tournament::getId, t -> t));
        Set<UUID> nameIds = new HashSet<>(ms.stream().map(LeagueMember::getUserId).toList());
        nameIds.add(l.getOwnerId());
        Map<UUID, String> names = names(nameIds);
        List<TournamentLink> tl = ls.stream()
                // Rejected / pending submissions are only interesting for the owner.
                .filter(x -> manage || x.getStatus() == LeagueTournamentStatus.ACCEPTED)
                .filter(x -> ts.containsKey(x.getTournamentId()))
                .map(x -> {
                    Tournament t = ts.get(x.getTournamentId());
                    return new TournamentLink(t.getId(), t.getName(), t.getStartsAt(), t.getRank(), t.getStatus(),
                            x.getStatus(), counts(x, t));
                })
                .sorted(Comparator.comparing(TournamentLink::startsAt))
                .toList();
        boolean member = viewer != null && ms.stream().anyMatch(m -> m.getUserId().equals(viewer.id()));
        return new Detail(l.getId(), l.settings(), new PlayerRef(l.getOwnerId(), names.getOrDefault(l.getOwnerId(), "?")),
                manage, member, ms.stream().map(m -> new PlayerRef(m.getUserId(), names.getOrDefault(m.getUserId(), "?")))
                .toList(), tl, standings(l));
    }

    /** Leagues a tournament belongs to (accepted), for the tournament page. */
    @Transactional(readOnly = true)
    public List<Summary> ofTournament(UUID tournamentId) {
        Set<UUID> ids = links.findByTournamentId(tournamentId).stream()
                .filter(x -> x.getStatus() == LeagueTournamentStatus.ACCEPTED)
                .map(LeagueTournament::getLeagueId).collect(Collectors.toSet());
        return list().stream().filter(s -> ids.contains(s.id())).toList();
    }

    /** Leagues where the player is a member or appears in the table, with the player's row. */
    public record PlayerLeague(UUID id, String name, LeagueScoringMode scoringMode, boolean active, StandingRow row,
                               int of) {
    }

    @Transactional(readOnly = true)
    public List<PlayerLeague> ofPlayer(UUID userId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<PlayerLeague> out = new ArrayList<>();
        for (League l : leagues.findAllByOrderByStartsOnDesc()) {
            List<StandingRow> table = standings(l);
            table.stream().filter(r -> r.userId().equals(userId)).findFirst().ifPresent(r ->
                    out.add(new PlayerLeague(l.getId(), l.getName(), l.getScoringMode(), l.covers(today), r,
                            table.size())));
        }
        return out;
    }

    // ------------------------------------------------------------------ owner

    @Transactional
    public UUID create(CurrentUser actor, League.Settings s) {
        validate(s);
        League l = new League(actor.id());
        l.update(s);
        leagues.save(l);
        members.save(new LeagueMember(l.getId(), actor.id()));
        audit.record(actor.id(), AUDIT_TYPE, l.getId(), "CREATED", l.getName());
        return l.getId();
    }

    @Transactional
    public void update(CurrentUser actor, UUID id, League.Settings s) {
        validate(s);
        League l = managed(actor, id);
        l.update(s);
        audit.record(actor.id(), AUDIT_TYPE, id, "UPDATED", null);
    }

    @Transactional
    public void delete(CurrentUser actor, UUID id) {
        League l = managed(actor, id);
        leagues.delete(l);  // members and links cascade; own games keep existing (league_id set to null)
        audit.record(actor.id(), AUDIT_TYPE, id, "DELETED", l.getName());
    }

    @Transactional
    public void decideTournament(CurrentUser actor, UUID id, UUID tournamentId, LeagueTournamentStatus status) {
        managed(actor, id);
        if (status == LeagueTournamentStatus.PENDING) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED");
        }
        LeagueTournament link = links.findByLeagueIdAndTournamentId(id, tournamentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND"));
        link.decide(status);
        audit.record(actor.id(), AUDIT_TYPE, id, "TOURNAMENT_" + status.name(), tournamentId.toString());
        League league = find(id);
        String tournamentName = tournaments.findById(tournamentId).map(Tournament::getName).orElse("?");
        notifications.notify(link.getRequestedBy(), NotificationType.LEAGUE_DECISION, Map.of("league", league.getName(),
                "tournament", tournamentName, "status", status.name()), "/leagues/" + id);
    }

    // ------------------------------------------------------------------ members

    @Transactional
    public void join(CurrentUser actor, UUID id) {
        leagues.findByIdForUpdate(id).orElseThrow(LeagueService::notFound);
        if (!members.existsByLeagueIdAndUserId(id, actor.id())) {
            members.save(new LeagueMember(id, actor.id()));
        }
    }

    @Transactional
    public void removeMember(CurrentUser actor, UUID id, UUID userId) {
        League l = find(id);
        if (!actor.id().equals(userId) && !canManage(actor, l)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (l.isOwnedBy(userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "OWNER_CANNOT_LEAVE");
        }
        members.findByLeagueIdAndUserId(id, userId).ifPresent(m -> {
            members.delete(m);
            if (!actor.id().equals(userId)) {
                audit.record(actor.id(), AUDIT_TYPE, id, "MEMBER_REMOVED", name(userId));
            }
        });
    }

    // ------------------------------------------------------------------ organizers

    /** The tournament's organizer submits it; the league owner's own tournaments are accepted at once. */
    @Transactional
    public LeagueTournamentStatus submitTournament(CurrentUser actor, UUID id, UUID tournamentId) {
        League l = find(id);
        Tournament t = tournaments.findById(tournamentId).orElseThrow(TournamentGuard::notFound);
        if (!TournamentGuard.canManage(actor, t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (t.getStatus() == TournamentStatus.CANCELLED) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_CANCELLED");
        }
        LeagueTournament link = links.findByLeagueIdAndTournamentId(id, tournamentId).orElse(null);
        if (link != null && link.getStatus() != LeagueTournamentStatus.REJECTED) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_SUBMITTED");
        }
        if (link != null) {
            links.delete(link);
            links.flush();
        }
        link = new LeagueTournament(id, tournamentId, actor.id());
        if (canManage(actor, l)) {
            link.decide(LeagueTournamentStatus.ACCEPTED);
        }
        links.save(link);
        audit.record(actor.id(), AUDIT_TYPE, id, "TOURNAMENT_SUBMITTED", t.getName());
        if (link.getStatus() == LeagueTournamentStatus.PENDING) {
            notifications.notify(l.getOwnerId(), NotificationType.LEAGUE_SUBMISSION,
                    Map.of("league", l.getName(), "tournament", t.getName()), "/leagues/" + id);
        }
        return link.getStatus();
    }

    /** League owner or the tournament's organizer takes a tournament out of the league. */
    @Transactional
    public void removeTournament(CurrentUser actor, UUID id, UUID tournamentId) {
        League l = find(id);
        Tournament t = tournaments.findById(tournamentId).orElseThrow(TournamentGuard::notFound);
        if (!canManage(actor, l) && !TournamentGuard.canManage(actor, t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        links.findByLeagueIdAndTournamentId(id, tournamentId).ifPresent(x -> {
            links.delete(x);
            audit.record(actor.id(), AUDIT_TYPE, id, "TOURNAMENT_REMOVED", t.getName());
        });
    }

    /** League links of a tournament, for its organizer (all statuses). */
    public record OrganizerLink(UUID leagueId, String leagueName, LeagueTournamentStatus status) {
    }

    @Transactional(readOnly = true)
    public List<OrganizerLink> linksOfTournament(CurrentUser actor, UUID tournamentId) {
        Tournament t = tournaments.findById(tournamentId).orElseThrow(TournamentGuard::notFound);
        TournamentGuard.requireManager(actor, t);
        List<LeagueTournament> ls = links.findByTournamentId(tournamentId);
        Map<UUID, String> names = leagues.findAllById(ls.stream().map(LeagueTournament::getLeagueId).toList()).stream()
                .collect(Collectors.toMap(League::getId, League::getName));
        return ls.stream().map(x -> new OrganizerLink(x.getLeagueId(), names.getOrDefault(x.getLeagueId(), "?"),
                x.getStatus())).toList();
    }

    // ------------------------------------------------------------------ table

    private static boolean counts(LeagueTournament link, Tournament t) {
        return link.getStatus() == LeagueTournamentStatus.ACCEPTED && t.getStatus() == TournamentStatus.FINISHED;
    }

    private static final class Acc {
        final UUID userId;
        BigDecimal points = BigDecimal.ZERO;
        int tournaments;
        int games;
        int wins;
        int draws;
        int losses;
        int small;

        Acc(UUID userId) {
            this.userId = userId;
        }
    }

    List<StandingRow> standings(League l) {
        List<Tournament> counted = new ArrayList<>();
        for (LeagueTournament link : links.findByLeagueId(l.getId())) {
            tournaments.findById(link.getTournamentId()).filter(t -> counts(link, t)).ifPresent(counted::add);
        }
        Map<UUID, Acc> acc = new LinkedHashMap<>();
        members.findByLeagueIdOrderByJoinedAtAsc(l.getId()).forEach(m -> acc.put(m.getUserId(), new Acc(m.getUserId())));
        List<FriendlyGame> own = l.isOwnGamesAllowed()
                ? friendly.findByLeagueIdAndStatus(l.getId(), FriendlyGameStatus.CONFIRMED) : List.of();

        if (l.getScoringMode() == LeagueScoringMode.ELO) {
            Set<UUID> tids = counted.stream().map(Tournament::getId).collect(Collectors.toSet());
            List<RatedGame> games = ratings.games().stream()
                    .filter(g -> (g.tournamentId() != null && tids.contains(g.tournamentId()))
                            || (g.leagueId() != null && g.leagueId().equals(l.getId()) && l.isOwnGamesAllowed()))
                    .toList();
            for (Tournament t : counted) {
                for (RoundService.StandingRow r : roundService.standings(null, t.getId()).rows()) {
                    acc.computeIfAbsent(r.userId(), Acc::new).tournaments++;
                }
            }
            Map<UUID, Elo.Rating> elo = Elo.replay(games);
            for (Map.Entry<UUID, Elo.Rating> e : elo.entrySet()) {
                Acc a = acc.computeIfAbsent(e.getKey(), Acc::new);
                Elo.Rating r = e.getValue();
                a.games = r.games;
                a.wins = r.wins;
                a.draws = r.draws;
                a.losses = r.losses;
            }
            for (Acc a : acc.values()) {
                Elo.Rating r = elo.get(a.userId);
                a.points = BigDecimal.valueOf(r == null ? Elo.START : r.rounded());
            }
        } else {
            List<Integer> place = l.placePointList();
            for (Tournament t : counted) {
                BigDecimal rankMultiplier = l.multiplierFor(t.getRank());
                for (RoundService.StandingRow r : roundService.standings(null, t.getId()).rows()) {
                    Acc a = acc.computeIfAbsent(r.userId(), Acc::new);
                    a.tournaments++;
                    a.games += r.played();
                    a.wins += r.wins();
                    a.draws += r.draws();
                    a.losses += r.losses();
                    a.small += r.smallPoints();
                    if (l.getScoringMode() == LeagueScoringMode.PLACE_POINTS) {
                        int base = r.position() <= place.size() ? place.get(r.position() - 1) : l.getParticipationPoints();
                        a.points = a.points.add(BigDecimal.valueOf(base).multiply(rankMultiplier));
                    } else {
                        // Big points of the tournament times the multiplier of its rank (local / master / international).
                        a.points = a.points.add(BigDecimal.valueOf(r.totalBigPoints()).multiply(rankMultiplier));
                    }
                }
            }
            if (l.getScoringMode() == LeagueScoringMode.BIG_POINTS) {
                for (FriendlyGame g : own) {
                    ownGame(acc, l, g.getPlayerA(), g.getSmallA(), g.getSmallB());
                    ownGame(acc, l, g.getPlayerB(), g.getSmallB(), g.getSmallA());
                }
            }
        }

        Map<UUID, String> names = names(acc.keySet());
        List<Acc> sorted = new ArrayList<>(acc.values());
        Comparator<Acc> order = Comparator.comparing((Acc a) -> a.points).reversed()
                .thenComparing(Comparator.comparingInt((Acc a) -> a.small).reversed());
        sorted.sort(order.thenComparing(a -> names.getOrDefault(a.userId, "")));
        List<StandingRow> out = new ArrayList<>();
        Acc prev = null;
        int position = 0;
        for (int i = 0; i < sorted.size(); i++) {
            Acc a = sorted.get(i);
            if (prev == null || order.compare(prev, a) != 0) {
                position = i + 1;
            }
            prev = a;
            out.add(new StandingRow(position, a.userId, names.getOrDefault(a.userId, "?"),
                    display(a.points), a.tournaments, a.games, a.wins,
                    a.draws, a.losses, a.small));
        }
        return out;
    }

    /** Two decimals at most, no exponent notation (60, 10.5, 7.25). */
    private static BigDecimal display(BigDecimal v) {
        BigDecimal scaled = v.setScale(2, RoundingMode.HALF_UP);
        BigDecimal stripped = scaled.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }

    private static void ownGame(Map<UUID, Acc> acc, League l, UUID player, int mine, int theirs) {
        Acc a = acc.computeIfAbsent(player, Acc::new);
        a.games++;
        a.small += mine;
        int base;
        if (mine > theirs) {
            a.wins++;
            base = l.getGameWinPoints();
        } else if (mine == theirs) {
            a.draws++;
            base = l.getGameDrawPoints();
        } else {
            a.losses++;
            base = l.getGameLossPoints();
        }
        a.points = a.points.add(BigDecimal.valueOf(base).multiply(l.getBigPointsMultiplier()));
    }

    // ------------------------------------------------------------------ helpers

    private void validate(League.Settings s) {
        if (s.endsOn().isBefore(s.startsOn())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "END_BEFORE_START");
        }
        if (s.placePoints().isEmpty() || s.placePoints().stream().anyMatch(p -> p == null || p < 0 || p > 1000)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PLACE_POINTS");
        }
        for (BigDecimal m : List.of(s.multiplierLocal(), s.multiplierMaster(), s.multiplierInternational(),
                s.bigPointsMultiplier())) {
            if (m == null || m.signum() < 0 || m.compareTo(BigDecimal.valueOf(100)) > 0) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MULTIPLIER");
            }
        }
    }

    static boolean canManage(CurrentUser viewer, League l) {
        return viewer != null && (viewer.admin() || l.isOwnedBy(viewer.id()));
    }

    private League find(UUID id) {
        return leagues.findById(id).orElseThrow(LeagueService::notFound);
    }

    private League managed(CurrentUser actor, UUID id) {
        League l = leagues.findByIdForUpdate(id).orElseThrow(LeagueService::notFound);
        if (!canManage(actor, l)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        return l;
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "LEAGUE_NOT_FOUND");
    }

    private Map<UUID, String> names(Set<UUID> ids) {
        return users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
    }

    private String name(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse(Objects.toString(id));
    }
}
