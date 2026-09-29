package com.skirmishchronicle.calendar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class IcsTest {

    @Test
    void escapesTextAndFoldsLongLinesWithoutBreakingCharacters() {
        String name = "Puchar Wisły; runda 1, finał\\ ".repeat(6);
        String ics = Ics.calendar("Test", List.of(new Ics.Event("x@warbracket", name,
                Instant.parse("2026-05-09T08:00:00Z"), null, "Kraków, PL", "linia 1\nlinia 2", "https://warbracket.pl/t/x",
                false)), Instant.parse("2026-01-01T00:00:00Z"));
        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\n"));
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"));
        assertTrue(ics.contains("DTSTART:20260509T080000Z\r\n"));
        assertTrue(ics.contains("DTEND:20260509T160000Z\r\n"));          // no end → start + 8 h
        assertTrue(ics.contains("LOCATION:Kraków\\, PL\r\n"));
        assertTrue(ics.contains("DESCRIPTION:linia 1\\nlinia 2\r\n"));
        for (String line : ics.split("\r\n")) {
            assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= 75, "line too long: " + line);
        }
        // unfolding restores the escaped summary
        String unfolded = ics.replace("\r\n ", "");
        assertTrue(unfolded.contains("SUMMARY:" + Ics.text(name) + "\r\n"));
        assertEquals("a\\;b\\,c\\\\d", Ics.text("a;b,c\\d"));
    }
}
