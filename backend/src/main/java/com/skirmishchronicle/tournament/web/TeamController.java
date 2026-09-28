package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.TeamRoundService;
import com.skirmishchronicle.tournament.service.TeamService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Teams of a team tournament, captains' line-ups and team standings. */
@RestController
@RequestMapping("/api/tournaments/{id}")
public class TeamController {

    public record TeamNameRequest(@NotBlank @Size(max = 60) String name) {
    }

    public record InviteRequest(@NotNull UUID userId) {
    }

    public record AddMemberRequest(@NotBlank @Size(max = 40) String displayName) {
    }

    public record OrderRequest(@NotEmpty @Size(max = 10) List<@NotNull UUID> order) {
    }

    public record LineupRequest(@NotNull UUID teamId, @NotEmpty @Size(max = 10) List<@NotNull UUID> order) {
    }

    private final TeamService teams;
    private final TeamRoundService teamRounds;

    public TeamController(TeamService teams, TeamRoundService teamRounds) {
        this.teams = teams;
        this.teamRounds = teamRounds;
    }

    @GetMapping("/teams")
    public TeamService.TeamsView list(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return teams.list(jwt == null ? null : CurrentUser.from(jwt), id);
    }

    @PostMapping("/teams")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> create(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                    @Valid @RequestBody TeamNameRequest body) {
        return Map.of("id", teams.create(CurrentUser.from(jwt), id, body.name()));
    }

    @PutMapping("/teams/{teamId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rename(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody TeamNameRequest body) {
        teams.rename(CurrentUser.from(jwt), id, teamId, body.name());
    }

    @DeleteMapping("/teams/{teamId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt) {
        teams.delete(CurrentUser.from(jwt), id, teamId);
    }

    @PostMapping("/teams/{teamId}/invite")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void invite(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody InviteRequest body) {
        teams.invite(CurrentUser.from(jwt), id, teamId, body.userId());
    }

    @PostMapping("/teams/{teamId}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt) {
        teams.accept(CurrentUser.from(jwt), id, teamId);
    }

    @PostMapping("/teams/{teamId}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt) {
        teams.decline(CurrentUser.from(jwt), id, teamId);
    }

    @DeleteMapping("/teams/{teamId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable UUID id, @PathVariable UUID teamId, @PathVariable UUID userId,
                             @AuthenticationPrincipal Jwt jwt) {
        teams.removeMember(CurrentUser.from(jwt), id, teamId, userId);
    }

    @PutMapping("/teams/{teamId}/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorder(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt,
                        @Valid @RequestBody OrderRequest body) {
        teams.reorder(CurrentUser.from(jwt), id, teamId, body.order());
    }

    @PostMapping("/teams/{teamId}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addMember(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody AddMemberRequest body) {
        teams.addMember(CurrentUser.from(jwt), id, teamId, body.displayName());
    }

    @PostMapping("/teams/{teamId}/drop")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void drop(@PathVariable UUID id, @PathVariable UUID teamId, @AuthenticationPrincipal Jwt jwt) {
        teams.drop(CurrentUser.from(jwt), id, teamId);
    }

    @PutMapping("/team-matches/{teamMatchId}/lineup")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void lineup(@PathVariable UUID id, @PathVariable UUID teamMatchId, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody LineupRequest body) {
        teamRounds.setLineup(CurrentUser.from(jwt), id, teamMatchId, body.teamId(), body.order());
    }

    @GetMapping("/team-standings")
    public List<TeamRoundService.TeamStandingRow> standings(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return teamRounds.standings(jwt == null ? null : CurrentUser.from(jwt), id);
    }
}
