package com.skirmishchronicle.league;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LeagueController {

    public record LeagueRequest(@NotBlank @Size(min = 3, max = 120) String name,
                                @Size(max = 4000) String description,
                                @Size(max = 80) String city,
                                @NotNull LocalDate startsOn,
                                @NotNull LocalDate endsOn,
                                @NotNull LeagueScoringMode scoringMode,
                                Boolean ownGamesAllowed,
                                @Size(min = 1, max = 64) List<@NotNull @Min(0) @Max(1000) Integer> placePoints,
                                @Min(0) @Max(1000) Integer participationPoints,
                                @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal multiplierLocal,
                                @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal multiplierMaster,
                                @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal multiplierInternational,
                                @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal bigPointsMultiplier,
                                @Min(0) @Max(1000) Integer gameWinPoints,
                                @Min(0) @Max(1000) Integer gameDrawPoints,
                                @Min(0) @Max(1000) Integer gameLossPoints) {

        League.Settings toSettings() {
            return new League.Settings(name, blank(description), blank(city), startsOn, endsOn, scoringMode,
                    ownGamesAllowed == null || ownGamesAllowed,
                    placePoints == null || placePoints.isEmpty() ? List.of(10, 8, 6, 5, 4, 3, 2, 1) : placePoints,
                    or(participationPoints, 1), or(multiplierLocal, BigDecimal.ONE),
                    or(multiplierMaster, new BigDecimal("1.5")), or(multiplierInternational, new BigDecimal("2")),
                    or(bigPointsMultiplier, BigDecimal.ONE), or(gameWinPoints, 3), or(gameDrawPoints, 1),
                    or(gameLossPoints, 0));
        }

        private static <T> T or(T value, T fallback) {
            return value == null ? fallback : value;
        }

        private static String blank(String s) {
            return s == null || s.isBlank() ? null : s.trim();
        }
    }

    public record SubmitRequest(@NotNull UUID tournamentId) {
    }

    public record DecisionRequest(@NotNull LeagueTournamentStatus status) {
    }

    private final LeagueService leagues;

    public LeagueController(LeagueService leagues) {
        this.leagues = leagues;
    }

    @GetMapping("/api/leagues")
    public List<LeagueService.Summary> list() {
        return leagues.list();
    }

    @PostMapping("/api/leagues")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LeagueRequest body) {
        return Map.of("id", leagues.create(CurrentUser.from(jwt), body.toSettings()));
    }

    @GetMapping("/api/leagues/{id}")
    public LeagueService.Detail detail(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return leagues.detail(CurrentUser.from(jwt), id);
    }

    @PutMapping("/api/leagues/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LeagueRequest body) {
        leagues.update(CurrentUser.from(jwt), id, body.toSettings());
    }

    @DeleteMapping("/api/leagues/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        leagues.delete(CurrentUser.from(jwt), id);
    }

    @PostMapping("/api/leagues/{id}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void join(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        leagues.join(CurrentUser.from(jwt), id);
    }

    @DeleteMapping("/api/leagues/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave(@PathVariable UUID id, @PathVariable UUID userId, @AuthenticationPrincipal Jwt jwt) {
        leagues.removeMember(CurrentUser.from(jwt), id, userId);
    }

    @PostMapping("/api/leagues/{id}/tournaments")
    public Map<String, LeagueTournamentStatus> submit(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                                      @Valid @RequestBody SubmitRequest body) {
        return Map.of("status", leagues.submitTournament(CurrentUser.from(jwt), id, body.tournamentId()));
    }

    @PutMapping("/api/leagues/{id}/tournaments/{tournamentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decide(@PathVariable UUID id, @PathVariable UUID tournamentId, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody DecisionRequest body) {
        leagues.decideTournament(CurrentUser.from(jwt), id, tournamentId, body.status());
    }

    @DeleteMapping("/api/leagues/{id}/tournaments/{tournamentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable UUID id, @PathVariable UUID tournamentId, @AuthenticationPrincipal Jwt jwt) {
        leagues.removeTournament(CurrentUser.from(jwt), id, tournamentId);
    }

    /** Public: leagues the tournament counts for. */
    @GetMapping("/api/tournaments/{tournamentId}/leagues")
    public List<LeagueService.Summary> ofTournament(@PathVariable UUID tournamentId) {
        return leagues.ofTournament(tournamentId);
    }

    /** Organizer: all league submissions of the tournament. */
    @GetMapping("/api/tournaments/{tournamentId}/league-links")
    public List<LeagueService.OrganizerLink> links(@PathVariable UUID tournamentId, @AuthenticationPrincipal Jwt jwt) {
        return leagues.linksOfTournament(CurrentUser.from(jwt), tournamentId);
    }
}
