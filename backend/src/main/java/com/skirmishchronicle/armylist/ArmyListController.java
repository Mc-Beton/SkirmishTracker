package com.skirmishchronicle.armylist;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.domain.ListFormat;
import com.skirmishchronicle.tournament.web.WarbandController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** "My lists": the caller's saved lists (private – nobody else can read them). */
@RestController
@RequestMapping("/api/army-lists")
public class ArmyListController {

    public record ArmyListRequest(@Size(max = ArmyListService.MAX_NAME) String name,
                                  @NotNull ListFormat format,
                                  @NotNull @Valid WarbandController.WarbandRequest list) {

        ArmyListService.Input toInput() {
            return new ArmyListService.Input(name, format, list.toInput());
        }
    }

    private final ArmyListService lists;

    public ArmyListController(ArmyListService lists) {
        this.lists = lists;
    }

    @GetMapping
    public List<ArmyListService.Summary> mine(@AuthenticationPrincipal Jwt jwt) {
        return lists.mine(CurrentUser.from(jwt));
    }

    @GetMapping("/{id}")
    public ArmyListService.View get(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return lists.get(CurrentUser.from(jwt), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ArmyListService.View create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ArmyListRequest body) {
        return lists.create(CurrentUser.from(jwt), body.toInput());
    }

    @PutMapping("/{id}")
    public ArmyListService.View update(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                       @Valid @RequestBody ArmyListRequest body) {
        return lists.update(CurrentUser.from(jwt), id, body.toInput());
    }

    /** Copy under the next number; {@code ?format=ROSTER} turns a classic list into a roster. */
    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public ArmyListService.View duplicate(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                          @RequestParam(required = false) ListFormat format) {
        return lists.duplicate(CurrentUser.from(jwt), id, format);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        lists.delete(CurrentUser.from(jwt), id);
    }
}
