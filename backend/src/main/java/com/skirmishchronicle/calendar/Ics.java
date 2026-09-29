package com.skirmishchronicle.calendar;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** Minimal iCalendar (RFC 5545) writer: UTC times, escaped text, lines folded at 75 octets, CRLF endings. */
public final class Ics {

    /** One calendar entry. {@code end} null = start + 8 hours. */
    public record Event(String uid, String summary, Instant start, Instant end, String location, String description,
                        String url, boolean cancelled) {
    }

    private static final DateTimeFormatter UTC = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);

    private Ics() {
    }

    public static String calendar(String name, List<Event> events, Instant now) {
        StringBuilder out = new StringBuilder();
        line(out, "BEGIN:VCALENDAR");
        line(out, "VERSION:2.0");
        line(out, "PRODID:-//WarBracket//Tournaments//PL");
        line(out, "CALSCALE:GREGORIAN");
        line(out, "METHOD:PUBLISH");
        line(out, "X-WR-CALNAME:" + text(name));
        line(out, "REFRESH-INTERVAL;VALUE=DURATION:PT12H");
        for (Event e : events) {
            line(out, "BEGIN:VEVENT");
            line(out, "UID:" + text(e.uid()));
            line(out, "DTSTAMP:" + UTC.format(now));
            line(out, "DTSTART:" + UTC.format(e.start()));
            line(out, "DTEND:" + UTC.format(e.end() != null && e.end().isAfter(e.start()) ? e.end()
                    : e.start().plusSeconds(8 * 3600)));
            line(out, "SUMMARY:" + text(e.summary()));
            if (e.location() != null && !e.location().isBlank()) {
                line(out, "LOCATION:" + text(e.location()));
            }
            if (e.description() != null && !e.description().isBlank()) {
                line(out, "DESCRIPTION:" + text(e.description()));
            }
            if (e.url() != null) {
                line(out, "URL:" + e.url());
            }
            line(out, "STATUS:" + (e.cancelled() ? "CANCELLED" : "CONFIRMED"));
            line(out, "END:VEVENT");
        }
        line(out, "END:VCALENDAR");
        return out.toString();
    }

    /** TEXT value escaping: backslash, semicolon, comma, newlines. */
    static String text(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n")
                .replace("\n", "\\n").replace("\r", "");
    }

    /** Appends a content line, folded so no physical line exceeds 75 octets (UTF-8 safe). */
    static void line(StringBuilder out, String content) {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        int limit = 75;
        int start = 0;
        while (bytes.length - start > limit) {
            int end = start + limit;
            // do not split a multi-byte character: back up to a lead byte
            while (end > start && (bytes[end] & 0xC0) == 0x80) {
                end--;
            }
            out.append(new String(bytes, start, end - start, StandardCharsets.UTF_8)).append("\r\n ");
            start = end;
            limit = 74; // continuation lines start with a space
        }
        out.append(new String(bytes, start, bytes.length - start, StandardCharsets.UTF_8)).append("\r\n");
    }
}
