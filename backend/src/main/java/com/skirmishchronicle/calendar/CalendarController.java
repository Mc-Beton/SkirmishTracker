package com.skirmishchronicle.calendar;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public: tournament calendar (JSON) and iCalendar files (one tournament, or a feed to subscribe to). */
@RestController
public class CalendarController {

    private static final MediaType CALENDAR = new MediaType("text", "calendar", java.nio.charset.StandardCharsets.UTF_8);

    private final CalendarService service;

    public CalendarController(CalendarService service) {
        this.service = service;
    }

    @GetMapping("/api/calendar")
    public List<CalendarService.CalendarEvent> events(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String country,
            @RequestParam(defaultValue = "false") boolean official) {
        return service.events(from, to, country, official);
    }

    @GetMapping("/api/calendar.ics")
    public ResponseEntity<String> feed(@RequestParam(required = false) String country,
                                       @RequestParam(defaultValue = "false") boolean official) {
        return ResponseEntity.ok().contentType(CALENDAR)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"warbracket.ics\"")
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=900")
                .body(service.feed(country, official));
    }

    @GetMapping("/api/tournaments/{id}/calendar.ics")
    public ResponseEntity<String> single(@PathVariable UUID id) {
        return ResponseEntity.ok().contentType(CALENDAR)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"tournament-" + id + ".ics\"")
                .body(service.single(id));
    }
}
