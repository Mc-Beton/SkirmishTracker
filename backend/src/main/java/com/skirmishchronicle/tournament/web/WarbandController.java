package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.WarbandService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Warband lists of a tournament. */
@RestController
@RequestMapping("/api/tournaments/{id}/warbands")
public class WarbandController {

    public record ItemRequest(@NotBlank @Size(max = 80) String item, boolean reduced) {
    }

    public record UnitRequest(@NotBlank @Size(max = 80) String unit,
                              @Min(0) @Max(WarbandService.MAX_EXTRA_POINTS) int extraPoints,
                              @Size(max = WarbandService.MAX_NOTES) String notes,
                              boolean leader,
                              @Size(max = WarbandService.MAX_ITEMS_PER_UNIT) List<@Valid @NotNull ItemRequest> items) {
    }

    public record WarbandRequest(@NotBlank @Size(max = 60) String faction,
                                 @Size(max = 60) String alliedFaction,
                                 @NotNull @Min(1) @Max(30) Integer leaderInt,
                                 @NotNull @Size(min = 1, max = WarbandService.MAX_UNITS) List<@Valid @NotNull UnitRequest> units) {

        WarbandService.SaveInput toInput() {
            return new WarbandService.SaveInput(faction, alliedFaction, leaderInt,
                    units.stream().map(u -> new WarbandService.UnitInput(u.unit(), u.extraPoints(), u.notes(),
                            u.leader(), u.items() == null ? List.of() : u.items().stream()
                                    .map(i -> new WarbandService.ItemInput(i.item(), i.reduced())).toList()))
                            .toList());
        }
    }

    private final WarbandService warbands;

    public WarbandController(WarbandService warbands) {
        this.warbands = warbands;
    }

    @GetMapping("/me")
    public WarbandService.MyWarband mine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return warbands.mine(CurrentUser.from(jwt), id);
    }

    @PutMapping("/me")
    public WarbandService.WarbandView saveMine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                               @Valid @RequestBody WarbandRequest body) {
        CurrentUser actor = CurrentUser.from(jwt);
        return warbands.save(actor, id, actor.id(), body.toInput());
    }

    @GetMapping
    public List<WarbandService.Summary> list(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return warbands.list(CurrentUser.from(jwt), id);
    }

    @GetMapping("/{userId}")
    public WarbandService.WarbandView get(@PathVariable UUID id, @PathVariable UUID userId,
                                          @AuthenticationPrincipal Jwt jwt) {
        return warbands.get(CurrentUser.from(jwt), id, userId);
    }

    /** Organizer correction of a player's list. */
    @PutMapping("/{userId}")
    public WarbandService.WarbandView save(@PathVariable UUID id, @PathVariable UUID userId,
                                           @AuthenticationPrincipal Jwt jwt,
                                           @Valid @RequestBody WarbandRequest body) {
        return warbands.save(CurrentUser.from(jwt), id, userId, body.toInput());
    }
}
