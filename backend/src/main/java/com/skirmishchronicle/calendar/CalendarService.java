package com.skirmishchronicle.calendar;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.config.AppProperties;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Public tournament calendar: a list for the calendar page and iCalendar files to subscribe to. */
@Service
public class CalendarService {

    /** At most this many days per request (the feed covers the coming year). */
    private static final int MAX_DAYS = 400;

    public record CalendarEvent(UUID id, String name, Instant startsAt, Instant endsAt, String venueName, String city,
                                String country, TournamentRank rank, TournamentStatus status, boolean official,
                                long registered, Integer maxPlayers, boolean team) {
    }

    private final TournamentRepository tournaments;
    private final ParticipantRepository participants;
    private final AppProperties props;

    public CalendarService(TournamentRepository tournaments, ParticipantRepository participants, AppProperties props) {
        this.tournaments = tournaments;
        this.participants = participants;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public List<CalendarEvent> events(LocalDate from, LocalDate to, String country, boolean officialOnly) {
        List<Tournament> list = select(from, to, country, officialOnly);
        Map<UUID, Long> counts = new HashMap<>();
        if (!list.isEmpty()) {
            for (Object[] row : participants.countByTournamentIds(list.stream().map(Tournament::getId).toList(),
                    ParticipantStatus.REGISTERED)) {
                counts.put((UUID) row[0], (Long) row[1]);
            }
        }
        return list.stream().map(t -> new CalendarEvent(t.getId(), t.getName(), t.getStartsAt(), t.getEndsAt(),
                t.getVenueName(), t.getCity(), t.getCountry(), t.getRank(), t.getStatus(), t.isOfficial(),
                counts.getOrDefault(t.getId(), 0L), t.getMaxPlayers(), t.getTeamSize() != null)).toList();
    }

    /** Subscription feed: the last month and the coming year. */
    @Transactional(readOnly = true)
    public String feed(String country, boolean officialOnly) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<Ics.Event> events = select(today.minusDays(31), today.plusDays(365), country, officialOnly).stream()
                .map(this::event).toList();
        String name = "WarBracket" + (country == null || country.isBlank() ? "" : " " + country.toUpperCase(Locale.ROOT))
                + (officialOnly ? " – official" : "");
        return Ics.calendar(name, events, Instant.now());
    }

    @Transactional(readOnly = true)
    public String single(UUID id) {
        Tournament t = tournaments.findById(id)
                .filter(x -> x.getStatus().isPublic())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND"));
        return Ics.calendar(t.getName(), List.of(event(t)), Instant.now());
    }

    private List<Tournament> select(LocalDate from, LocalDate to, String country, boolean officialOnly) {
        if (from == null || to == null || to.isBefore(from) || from.plusDays(MAX_DAYS).isBefore(to)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DATE_RANGE");
        }
        String c = country == null || country.isBlank() ? null : country.strip().toUpperCase(Locale.ROOT);
        if (c != null && !c.matches("[A-Z]{2}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DATE_RANGE");
        }
        return visible(from, to).filter(t -> c == null || c.equals(t.getCountry()))
                .filter(t -> !officialOnly || t.isOfficial()).toList();
    }

    private Stream<Tournament> visible(LocalDate from, LocalDate to) {
        return tournaments.findByStartsAtGreaterThanEqualAndStartsAtLessThanOrderByStartsAtAsc(
                        from.atStartOfDay(ZoneOffset.UTC).toInstant(), to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant())
                .stream().filter(t -> t.getStatus().isPublic() && t.getStatus() != TournamentStatus.CANCELLED);
    }

    private Ics.Event event(Tournament t) {
        String location = Stream.of(t.getVenueName(), t.getAddress(), t.getCity(), t.getCountry())
                .filter(s -> s != null && !s.isBlank()).collect(Collectors.joining(", "));
        String url = props.frontendUrl() + "/tournaments/" + t.getId();
        String description = url + (t.getDescription() == null ? "" : "\n\n" + abbreviate(t.getDescription(), 1500));
        return new Ics.Event(t.getId() + "@warbracket", t.getName(), t.getStartsAt(), t.getEndsAt(), location,
                description, url, t.getStatus() == TournamentStatus.CANCELLED);
    }

    private static String abbreviate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
