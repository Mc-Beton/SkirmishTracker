package com.skirmishchronicle.profile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class BadgesTest {

    @Test
    void longestWinStreakIgnoresDrawsAndLosses() {
        assertEquals(3, Badges.bestWinStreak(List.of(1.0, 1.0, 0.5, 1.0, 1.0, 1.0, 0.0, 1.0)));
        assertEquals(0, Badges.bestWinStreak(List.of()));
    }

    @Test
    void badgesShowProgressTowardsTheirTargets() {
        Map<String, Badges.Badge> b = Badges.of(new Badges.Input(30, 5, 0, 2, 1, 12, 3, true, 0, 0)).stream()
                .collect(Collectors.toMap(Badges.Badge::code, x -> x));
        assertTrue(b.get("FIRST_GAME").earned());
        assertTrue(b.get("VETERAN").earned());
        assertFalse(b.get("LEGEND").earned());
        assertEquals(30, b.get("LEGEND").progress());
        assertEquals(100, b.get("LEGEND").target());
        assertTrue(b.get("WIN_STREAK").earned());
        assertTrue(b.get("GIANT_SLAYER").earned());
        assertFalse(b.get("PODIUM").earned());
        assertEquals(2, b.get("PODIUM").progress());
        assertTrue(b.get("FACTION_MASTER").earned());
        assertEquals(10, b.get("FACTION_MASTER").progress());   // capped at the target
        assertFalse(b.get("ORGANIZER").earned());
    }
}
