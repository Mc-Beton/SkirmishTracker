package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.GameService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Detailed game mode: scenario, schemes and per-turn victory points. */
@RestController
@RequestMapping("/api/tournaments/{id}")
public class GameController {

    public record ScenarioRequest(@Size(max = 60) String scenarioCode) {
    }

    /** Both fields are ignored when the player has a warband in this tournament. */
    public record DrawRequest(@Size(max = 60) String faction, @Min(1) @Max(30) Integer leaderInt) {
    }

    public record KeepRequest(@NotBlank @Size(max = 60) String scheme) {
    }

    public record TurnRequest(@NotNull UUID playerId, @NotNull @Min(0) @Max(100) Integer scenarioVp,
                              @NotNull @Min(0) @Max(100) Integer schemeVp) {
    }

    private final GameService games;

    public GameController(GameService games) {
        this.games = games;
    }

    @GetMapping("/matches/{matchId}/game")
    public GameService.GameView view(@PathVariable UUID id, @PathVariable UUID matchId,
                                     @AuthenticationPrincipal Jwt jwt) {
        return games.view(CurrentUser.from(jwt), id, matchId);
    }

    @PutMapping("/rounds/{number}/scenario")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void scenario(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt,
                         @Valid @RequestBody ScenarioRequest body) {
        String code = body.scenarioCode() == null || body.scenarioCode().isBlank() ? null : body.scenarioCode();
        games.setRoundScenario(CurrentUser.from(jwt), id, number, code);
    }

    @PostMapping("/matches/{matchId}/schemes/draw")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void draw(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt,
                     @Valid @RequestBody DrawRequest body) {
        games.drawSchemes(CurrentUser.from(jwt), id, matchId, body.faction(), body.leaderInt());
    }

    @PostMapping("/matches/{matchId}/schemes/keep")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void keep(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt,
                     @Valid @RequestBody KeepRequest body) {
        games.keepScheme(CurrentUser.from(jwt), id, matchId, body.scheme());
    }

    @DeleteMapping("/matches/{matchId}/schemes/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetDraw(@PathVariable UUID id, @PathVariable UUID matchId, @PathVariable UUID userId,
                          @AuthenticationPrincipal Jwt jwt) {
        games.resetDraw(CurrentUser.from(jwt), id, matchId, userId);
    }

    @PutMapping("/matches/{matchId}/turns/{turn}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void turn(@PathVariable UUID id, @PathVariable UUID matchId, @PathVariable int turn,
                     @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TurnRequest body) {
        games.saveTurn(CurrentUser.from(jwt), id, matchId, body.playerId(), turn, body.scenarioVp(), body.schemeVp());
    }

    @PostMapping("/matches/{matchId}/finish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void finish(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt) {
        games.finish(CurrentUser.from(jwt), id, matchId);
    }
}
