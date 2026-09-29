package com.skirmishchronicle.analytics;

import java.time.LocalDate;

/**
 * Which games a report covers. All fields optional. {@code country} and {@code tier} only match tournament games;
 * {@code minElo} keeps games where both players were rated at least that high before the game.
 */
public record MetaFilter(LocalDate from, LocalDate to, SideFact.Source source, String country, String tier,
                         Integer minElo) {

    public static final MetaFilter ALL = new MetaFilter(null, null, null, null, null, null);

    boolean matches(SideFact f) {
        if (from != null && f.playedOn().isBefore(from)) {
            return false;
        }
        if (to != null && f.playedOn().isAfter(to)) {
            return false;
        }
        if (source != null && f.source() != source) {
            return false;
        }
        if (country != null && !country.equalsIgnoreCase(f.country())) {
            return false;
        }
        if (tier != null && !tier.equals(f.tier())) {
            return false;
        }
        return minElo == null || (f.elo() >= minElo && f.opponentElo() >= minElo);
    }
}
