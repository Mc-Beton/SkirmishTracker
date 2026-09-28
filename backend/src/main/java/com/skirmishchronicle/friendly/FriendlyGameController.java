package com.skirmishchronicle.friendly;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/games")
public class FriendlyGameController {

    public record ReportRequest(@NotNull UUID opponentId,
                                @NotNull @Min(0) @Max(1000) Integer myScore,
                                @NotNull @Min(0) @Max(1000) Integer opponentScore,
                                @NotNull LocalDate playedOn,
                                @Size(max = 60) String scenarioCode,
                                @Size(max = 60) String myFaction,
                                @Size(max = 60) String opponentFaction,
                                UUID leagueId,
                                @Size(max = 500) String notes,
                                @Valid ListRequest myList,
                                @Valid ListRequest opponentList) {
    }

    public record ItemRequest(@NotNull @Size(max = 80) String item, boolean reduced) {
    }

    public record UnitRequest(@NotNull @Size(max = 80) String unit, boolean leader,
                              @Size(max = FriendlyGameService.MAX_LIST_ITEMS) List<@Valid @NotNull ItemRequest> items) {
    }

    public record ListRequest(@NotNull @Size(max = 60) String faction, @Size(max = 60) String alliedFaction,
                              @NotNull @Size(min = 1, max = FriendlyGameService.MAX_LIST_UNITS)
                              List<@Valid @NotNull UnitRequest> units) {

        GameList toList() {
            return new GameList(faction, alliedFaction, units.stream().map(u -> new GameList.Unit(u.unit(), u.leader(),
                    u.items() == null ? List.of() : u.items().stream()
                            .map(i -> new GameList.Item(i.item(), i.reduced())).toList())).toList(), 0);
        }
    }

    private final FriendlyGameService games;

    public FriendlyGameController(FriendlyGameService games) {
        this.games = games;
    }

    @GetMapping("/mine")
    public List<FriendlyGameService.GameView> mine(@AuthenticationPrincipal Jwt jwt) {
        return games.mine(CurrentUser.from(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> report(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReportRequest body) {
        UUID id = games.report(CurrentUser.from(jwt), new FriendlyGameService.Report(body.opponentId(),
                body.myScore(), body.opponentScore(), body.playedOn(), blank(body.scenarioCode()),
                blank(body.myFaction()), blank(body.opponentFaction()), body.leagueId(), body.notes(),
                body.myList() == null ? null : body.myList().toList(),
                body.opponentList() == null ? null : body.opponentList().toList()));
        return Map.of("id", id);
    }

    @PostMapping("/{id}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirm(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        games.decide(CurrentUser.from(jwt), id, true);
    }

    @PostMapping("/{id}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        games.decide(CurrentUser.from(jwt), id, false);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        games.withdraw(CurrentUser.from(jwt), id);
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
