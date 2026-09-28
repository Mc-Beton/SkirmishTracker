package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.service.TournamentService;
import com.skirmishchronicle.tournament.service.TournamentViews;
import com.skirmishchronicle.tournament.web.TournamentRequests.AddPlayerRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.TournamentRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.UpdateParticipantRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tournaments")
public class TournamentController {

    private final TournamentService service;

    public TournamentController(TournamentService service) {
        this.service = service;
    }

    // ------------------------------------------------ public (anonymous allowed)

    @GetMapping
    public TournamentViews.Page<TournamentViews.Summary> list(
            @RequestParam(defaultValue = "UPCOMING") TournamentService.Tab tab,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) TournamentRank rank,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(tab, city, rank, page, size);
    }

    @GetMapping("/{id}")
    public TournamentViews.Detail detail(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.detail(CurrentUser.from(jwt), id);
    }

    @GetMapping("/{id}/participants")
    public List<TournamentViews.Participant> participants(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.participants(CurrentUser.from(jwt), id);
    }

    // ------------------------------------------------ signed-in player

    @GetMapping("/mine")
    public TournamentViews.MyTournaments mine(@AuthenticationPrincipal Jwt jwt) {
        return service.mine(CurrentUser.from(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TournamentRequest body) {
        return Map.of("id", service.create(CurrentUser.from(jwt), body.toDetails(), body.toSettings(), body.toPlans()));
    }

    @PostMapping("/{id}/registration")
    public Map<String, ParticipantStatus> register(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return Map.of("status", service.register(CurrentUser.from(jwt), id));
    }

    @DeleteMapping("/{id}/registration")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.withdraw(CurrentUser.from(jwt), id);
    }

    // ------------------------------------------------ organizer

    @PutMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody TournamentRequest body) {
        service.update(CurrentUser.from(jwt), id, body.toDetails(), body.toSettings(), body.toPlans());
    }

    @PostMapping("/{id}/publish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void publish(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.changeStatus(CurrentUser.from(jwt), id, TournamentStatus.PUBLISHED);
    }

    @PostMapping("/{id}/close-registration")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void closeRegistration(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.changeStatus(CurrentUser.from(jwt), id, TournamentStatus.REGISTRATION_CLOSED);
    }

    @PostMapping("/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.changeStatus(CurrentUser.from(jwt), id, TournamentStatus.CANCELLED);
    }

    @PostMapping("/{id}/participants")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addPlayer(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody AddPlayerRequest body) {
        service.addPlayer(CurrentUser.from(jwt), id, body.displayName());
    }

    @PatchMapping("/{id}/participants/{participantId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateParticipant(@PathVariable UUID id, @PathVariable UUID participantId,
                                  @AuthenticationPrincipal Jwt jwt, @RequestBody UpdateParticipantRequest body) {
        service.updateParticipant(CurrentUser.from(jwt), id, participantId, body.paid(), body.listStatus());
    }

    @DeleteMapping("/{id}/participants/{participantId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removePlayer(@PathVariable UUID id, @PathVariable UUID participantId,
                             @AuthenticationPrincipal Jwt jwt) {
        service.removePlayer(CurrentUser.from(jwt), id, participantId);
    }

    @GetMapping("/{id}/audit")
    public List<TournamentViews.AuditItem> audit(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.auditLog(CurrentUser.from(jwt), id);
    }
}
