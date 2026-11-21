package com.skirmishchronicle.club;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Players' teams. Signed-in users only (as everything under /api that is not listed as public). */
@RestController
@RequestMapping("/api/clubs")
public class ClubController {

    public record NameRequest(@NotNull @Size(min = 3, max = 80) String name) {
    }

    public record UserRequest(@NotNull UUID userId) {
    }

    public record InviteRequest(@NotNull @Size(max = 100) String invite) {
    }

    private final ClubService clubs;

    public ClubController(ClubService clubs) {
        this.clubs = clubs;
    }

    private static CurrentUser user(Jwt jwt) {
        return CurrentUser.from(jwt);
    }

    @GetMapping("/mine")
    public ClubService.Mine mine(@AuthenticationPrincipal Jwt jwt) {
        return clubs.mine(user(jwt));
    }

    @GetMapping
    public List<ClubStore.Listed> search(@RequestParam(defaultValue = "") String q) {
        return clubs.search(q);
    }

    @GetMapping("/{id}")
    public ClubService.ClubView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return clubs.get(user(jwt), id);
    }

    @PostMapping
    public ClubService.ClubView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NameRequest body) {
        return clubs.create(user(jwt), body.name());
    }

    @PatchMapping("/{id}")
    public ClubService.ClubView rename(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                       @Valid @RequestBody NameRequest body) {
        return clubs.rename(user(jwt), id, body.name());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dissolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.dissolve(user(jwt), id);
    }

    @PostMapping("/{id}/link")
    public Map<String, String> newLink(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return Map.of("invite", clubs.newLink(user(jwt), id));
    }

    @DeleteMapping("/{id}/link")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void closeLink(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.closeLink(user(jwt), id);
    }

    @PostMapping("/join")
    public ClubService.ClubView join(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody InviteRequest body) {
        return clubs.joinByLink(user(jwt), body.invite());
    }

    @PostMapping("/{id}/invitations")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void invite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UserRequest body) {
        clubs.invite(user(jwt), id, body.userId());
    }

    @DeleteMapping("/{id}/invitations/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelInvitation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) {
        clubs.cancelInvitation(user(jwt), id, userId);
    }

    @PostMapping("/{id}/invitations/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acceptInvitation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.answerInvitation(user(jwt), id, true);
    }

    @PostMapping("/{id}/invitations/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void declineInvitation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.answerInvitation(user(jwt), id, false);
    }

    @PostMapping("/{id}/requests")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.request(user(jwt), id);
    }

    @DeleteMapping("/{id}/requests")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdrawRequest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        clubs.withdrawRequest(user(jwt), id);
    }

    @PostMapping("/{id}/requests/{userId}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acceptRequest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) {
        clubs.decideRequest(user(jwt), id, userId, true);
    }

    @PostMapping("/{id}/requests/{userId}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void declineRequest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) {
        clubs.decideRequest(user(jwt), id, userId, false);
    }

    @PostMapping("/{id}/owner")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void transfer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UserRequest body) {
        clubs.transfer(user(jwt), id, body.userId());
    }

    @DeleteMapping("/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) {
        clubs.removeMember(user(jwt), id, userId);
    }
}
