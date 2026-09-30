package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.PartyRules;
import com.skirmishchronicle.tournament.service.PartyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Roster format: the party picked for one game. Signed-in users only (the party is hidden information). */
@RestController
public class PartyController {

    public record PickRequest(@NotNull @Min(0) @Max(100) Integer slot, @Size(max = 20) List<@NotNull Integer> items) {
    }

    public record PartyRequest(@NotEmpty @Size(max = 40) List<@Valid @NotNull PickRequest> units,
                               @NotNull @Min(0) @Max(100) Integer leaderSlot,
                               @NotNull @Min(1) @Max(30) Integer leaderInt) {
    }

    private final PartyService parties;

    public PartyController(PartyService parties) {
        this.parties = parties;
    }

    @GetMapping("/api/tournaments/{id}/matches/{matchId}/party")
    public PartyService.PartyView view(@PathVariable UUID id, @PathVariable UUID matchId,
                                       @AuthenticationPrincipal Jwt jwt) {
        return parties.view(CurrentUser.from(jwt), id, matchId);
    }

    /** {@code userId}: the organizer setting the party for a player; players omit it. */
    @PutMapping("/api/tournaments/{id}/matches/{matchId}/party")
    public PartyService.PartyView save(@PathVariable UUID id, @PathVariable UUID matchId,
                                       @RequestParam(required = false) UUID userId,
                                       @Valid @RequestBody PartyRequest body, @AuthenticationPrincipal Jwt jwt) {
        List<PartyRules.Pick> picks = body.units().stream()
                .map(p -> new PartyRules.Pick(p.slot(), p.items() == null ? List.of() : p.items())).toList();
        return parties.save(CurrentUser.from(jwt), id, matchId, userId,
                new PartyService.SaveInput(picks, body.leaderSlot(), body.leaderInt()));
    }
}
