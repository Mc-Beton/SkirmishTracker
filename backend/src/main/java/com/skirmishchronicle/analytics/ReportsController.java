package com.skirmishchronicle.analytics;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import java.time.LocalDate;
import java.util.Locale;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Publisher / operator reports. Access: roles ADMIN and PUBLISHER (see SecurityConfig). Aggregates only. */
@RestController
public class ReportsController {

    private final AnalyticsService analytics;

    public ReportsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/api/admin/reports/meta")
    public AnalyticsService.MetaResponse meta(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) String tier,
            @RequestParam(required = false) Integer minElo) {
        return analytics.meta(filter(from, to, source, country, tier, minElo));
    }

    static MetaFilter filter(LocalDate from, LocalDate to, String source, String country, String tier,
                             Integer minElo) {
        if (from != null && to != null && from.isAfter(to)) {
            throw invalid();
        }
        SideFact.Source src = null;
        if (source != null && !source.isBlank()) {
            try {
                src = SideFact.Source.valueOf(source);
            } catch (IllegalArgumentException e) {
                throw invalid();
            }
        }
        String c = null;
        if (country != null && !country.isBlank()) {
            if (!country.matches("[A-Za-z]{2}")) {
                throw invalid();
            }
            c = country.toUpperCase(Locale.ROOT);
        }
        String t = null;
        if (tier != null && !tier.isBlank()) {
            try {
                t = TournamentRank.valueOf(tier).name();
            } catch (IllegalArgumentException e) {
                throw invalid();
            }
        }
        if (minElo != null && (minElo < 0 || minElo > 4000)) {
            throw invalid();
        }
        return new MetaFilter(from, to, src, c, t, minElo);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REPORT_FILTER");
    }
}
