package com.skirmishchronicle.season;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import com.skirmishchronicle.tournament.service.RoundService;
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
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Seasons, the seasonal ranking from official tournaments, and marking tournaments official. */
@Service
public class SeasonService {

    public record SeasonSummary(UUID id, String name, LocalDate startsOn, LocalDate endsOn, boolean current) {
    }

    public record TournamentRef(UUID id, String name, Instant startsAt, String city, String country,
                                TournamentRank rank, int players, String organizerName, int basePoints) {
    }

    public record ResultView(UUID tournamentId, int place, int players, int points, boolean counted) {
    }

    public record RankingRow(int position, UUID userId, String displayName, String club, int points, int events,
                             List<ResultView> results) {
    }

    /** An organizer of official tournaments in the season (the publisher's Guildmaster activity view). */
    public record OrganizerRow(UUID userId, String displayName, int events, int players, List<String> countries) {
    }

    public record SeasonView(SeasonSummary season, Season.Settings settings, List<RankingRow> ranking,
                             List<TournamentRef> tournaments, List<OrganizerRow> organizers) {
    }

    /** A tournament the publisher can mark official. */
    public record Candidate(UUID id, String name, Instant startsAt, String city, String country, TournamentRank rank,
                            TournamentStatus status, long players, String organizerName, boolean official,
                            boolean team) {
    }

    private final SeasonRepository seasons;
    private final TournamentRepository tournaments;
    private final RoundRepository rounds;
    private final RoundService roundService;
    private final ParticipantRepository participants;
    private final UserRepository users;
    private final AuditService audit;

    public SeasonService(SeasonRepository seasons, TournamentRepository tournaments, RoundRepository rounds,
                         RoundService roundService, ParticipantRepository participants, UserRepository users,
                         AuditService audit) {
        this.seasons = seasons;
        this.tournaments = tournaments;
        this.rounds = rounds;
        this.roundService = roundService;
        this.participants = participants;
        this.users = users;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ public

    @Transactional(readOnly = true)
    public List<SeasonSummary> list() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return seasons.findAllByOrderByStartsOnDesc().stream().map(s -> summary(s, today)).toList();
    }

    @Transactional(readOnly = true)
    public SeasonView view(UUID id) {
        Season season = seasons.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND"));
        List<Tournament> counted = inSeason(season).stream()
                .filter(t -> t.isOfficial() && t.getStatus() == TournamentStatus.FINISHED && t.getTeamSize() == null
                        && rounds.countByTournamentId(t.getId()) > 0)
                .toList();
        List<SeasonScoring.Result> results = new ArrayList<>();
        Map<UUID, Integer> playersOf = new HashMap<>();
        for (Tournament t : counted) {
            List<RoundService.StandingRow> rows = roundService.standings(null, t.getId()).rows();
            playersOf.put(t.getId(), rows.size());
            int base = season.basePoints(t.getRank());
            rows.forEach(r -> results.add(new SeasonScoring.Result(r.userId(), t.getId(), base, rows.size(),
                    r.position())));
        }
        List<SeasonScoring.Row> ranked = SeasonScoring.rank(results, season.getBestResults());
        Set<UUID> people = new HashSet<>();
        ranked.forEach(r -> people.add(r.userId()));
        counted.forEach(t -> people.add(t.getOwnerId()));
        Map<UUID, User> byId = users.findAllById(people).stream().collect(Collectors.toMap(User::getId, u -> u));
        List<RankingRow> ranking = ranked.stream().map(r -> {
            User u = byId.get(r.userId());
            return new RankingRow(r.position(), r.userId(), u == null ? "?" : u.getDisplayName(),
                    u == null ? null : u.getClub(), r.points(), r.events(), r.results().stream()
                    .map(x -> new ResultView(x.tournamentId(), x.place(), x.players(), x.points(), x.counted()))
                    .toList());
        }).toList();
        List<TournamentRef> refs = counted.stream().map(t -> new TournamentRef(t.getId(), t.getName(),
                t.getStartsAt(), t.getCity(), t.getCountry(), t.getRank(), playersOf.getOrDefault(t.getId(), 0),
                name(byId, t.getOwnerId()), season.basePoints(t.getRank()))).toList();
        Map<UUID, List<Tournament>> byOrganizer = new LinkedHashMap<>();
        counted.forEach(t -> byOrganizer.computeIfAbsent(t.getOwnerId(), k -> new ArrayList<>()).add(t));
        List<OrganizerRow> organizers = new ArrayList<>();
        byOrganizer.forEach((owner, list) -> organizers.add(new OrganizerRow(owner, name(byId, owner), list.size(),
                list.stream().mapToInt(t -> playersOf.getOrDefault(t.getId(), 0)).sum(),
                List.copyOf(list.stream().map(Tournament::getCountry).collect(Collectors.toCollection(TreeSet::new))))));
        organizers.sort(Comparator.comparingInt(OrganizerRow::events).reversed()
                .thenComparing(Comparator.comparingInt(OrganizerRow::players).reversed())
                .thenComparing(OrganizerRow::displayName));
        return new SeasonView(summary(season, LocalDate.now(ZoneOffset.UTC)), season.settings(), ranking, refs,
                organizers);
    }

    // ------------------------------------------------------------------ admin / publisher

    @Transactional
    public SeasonSummary create(CurrentUser actor, Season.Settings settings) {
        validate(settings);
        Season s = seasons.save(new Season(settings));
        audit.record(actor.id(), "SEASON", s.getId(), "SEASON_CREATED", s.getName());
        return summary(s, LocalDate.now(ZoneOffset.UTC));
    }

    @Transactional
    public SeasonSummary update(CurrentUser actor, UUID id, Season.Settings settings) {
        validate(settings);
        Season s = seasons.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND"));
        s.apply(settings);
        audit.record(actor.id(), "SEASON", id, "SEASON_UPDATED", s.getName());
        return summary(s, LocalDate.now(ZoneOffset.UTC));
    }

    @Transactional
    public void delete(CurrentUser actor, UUID id) {
        Season s = seasons.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND"));
        seasons.delete(s);
        audit.record(actor.id(), "SEASON", id, "SEASON_DELETED", s.getName());
    }

    @Transactional(readOnly = true)
    public List<Candidate> candidates(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || from.plusYears(2).isBefore(to)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DATE_RANGE");
        }
        List<Tournament> list = tournaments.findByStartsAtGreaterThanEqualAndStartsAtLessThanOrderByStartsAtAsc(
                        from.atStartOfDay(ZoneOffset.UTC).toInstant(),
                        to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()).stream()
                .filter(t -> t.getStatus().isPublic() && t.getStatus() != TournamentStatus.CANCELLED).toList();
        Map<UUID, Long> counts = new HashMap<>();
        if (!list.isEmpty()) {
            for (Object[] row : participants.countByTournamentIds(list.stream().map(Tournament::getId).toList(),
                    ParticipantStatus.REGISTERED)) {
                counts.put((UUID) row[0], (Long) row[1]);
            }
        }
        Map<UUID, User> owners = users.findAllById(list.stream().map(Tournament::getOwnerId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, u -> u));
        return list.stream().map(t -> new Candidate(t.getId(), t.getName(), t.getStartsAt(), t.getCity(),
                t.getCountry(), t.getRank(), t.getStatus(), counts.getOrDefault(t.getId(), 0L), name(owners, t.getOwnerId()),
                t.isOfficial(), t.getTeamSize() != null)).toList();
    }

    @Transactional
    public void setOfficial(CurrentUser actor, UUID tournamentId, boolean official) {
        Tournament t = tournaments.findById(tournamentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND"));
        if (!t.getStatus().isPublic() || t.getStatus() == TournamentStatus.CANCELLED) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_ELIGIBLE");
        }
        if (t.isOfficial() == official) {
            return;
        }
        t.markOfficial(official, actor.id());
        audit.record(actor.id(), "TOURNAMENT", tournamentId, official ? "MARKED_OFFICIAL" : "UNMARKED_OFFICIAL",
                t.getName());
    }

    // ------------------------------------------------------------------ helpers

    private List<Tournament> inSeason(Season s) {
        return tournaments.findByStartsAtGreaterThanEqualAndStartsAtLessThanOrderByStartsAtAsc(
                s.getStartsOn().atStartOfDay(ZoneOffset.UTC).toInstant(),
                s.getEndsOn().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
    }

    private static SeasonSummary summary(Season s, LocalDate today) {
        return new SeasonSummary(s.getId(), s.getName(), s.getStartsOn(), s.getEndsOn(),
                !today.isBefore(s.getStartsOn()) && !today.isAfter(s.getEndsOn()));
    }

    private static String name(Map<UUID, User> users, UUID id) {
        User u = users.get(id);
        return u == null ? "?" : u.getDisplayName();
    }

    private static void validate(Season.Settings s) {
        boolean ok = s != null && s.name() != null && !s.name().isBlank() && s.name().strip().length() <= 80
                && s.startsOn() != null && s.endsOn() != null && !s.endsOn().isBefore(s.startsOn())
                && !s.startsOn().plusYears(3).isBefore(s.endsOn())
                && between(s.pointsLocal(), 0, 10000) && between(s.pointsMaster(), 0, 10000)
                && between(s.pointsInternational(), 0, 10000) && between(s.bestResults(), 1, 50);
        if (!ok) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SEASON");
        }
    }

    private static boolean between(int v, int min, int max) {
        return v >= min && v <= max;
    }
}
