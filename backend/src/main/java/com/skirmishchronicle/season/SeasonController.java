package com.skirmishchronicle.season;

import com.skirmishchronicle.common.CurrentUser;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public season rankings; managing seasons and official tournaments: roles ADMIN and PUBLISHER. */
@RestController
public class SeasonController {

    public record OfficialRequest(boolean official) {
    }

    private final SeasonService service;

    public SeasonController(SeasonService service) {
        this.service = service;
    }

    @GetMapping("/api/seasons")
    public List<SeasonService.SeasonSummary> list() {
        return service.list();
    }

    @GetMapping("/api/seasons/{id}")
    public SeasonService.SeasonView view(@PathVariable UUID id) {
        return service.view(id);
    }

    @PostMapping("/api/admin/seasons")
    @ResponseStatus(HttpStatus.CREATED)
    public SeasonService.SeasonSummary create(@RequestBody Season.Settings settings, @AuthenticationPrincipal Jwt jwt) {
        return service.create(CurrentUser.from(jwt), trim(settings));
    }

    @PutMapping("/api/admin/seasons/{id}")
    public SeasonService.SeasonSummary update(@PathVariable UUID id, @RequestBody Season.Settings settings,
                                              @AuthenticationPrincipal Jwt jwt) {
        return service.update(CurrentUser.from(jwt), id, trim(settings));
    }

    @DeleteMapping("/api/admin/seasons/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(CurrentUser.from(jwt), id);
    }

    @GetMapping("/api/admin/official/tournaments")
    public List<SeasonService.Candidate> candidates(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.candidates(from, to);
    }

    @PutMapping("/api/admin/official/tournaments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setOfficial(@PathVariable UUID id, @RequestBody OfficialRequest body, @AuthenticationPrincipal Jwt jwt) {
        service.setOfficial(CurrentUser.from(jwt), id, body.official());
    }

    private static Season.Settings trim(Season.Settings s) {
        return s == null ? null : new Season.Settings(s.name() == null ? null : s.name().strip(), s.startsOn(),
                s.endsOn(), s.pointsLocal(), s.pointsMaster(), s.pointsInternational(), s.bestResults());
    }
}
