package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.TableService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Round timer (organizer) and judge calls (players call, organizer resolves). */
@RestController
@RequestMapping("/api/tournaments/{id}")
public class TableController {

    public record TimerRequest(@Min(1) @Max(600) Integer minutes) {
    }

    public record AddTimeRequest(@NotNull @Min(-120) @Max(120) Integer minutes) {
    }

    public record JudgeRequest(@Size(max = 300) String note) {
    }

    private final TableService tables;

    public TableController(TableService tables) {
        this.tables = tables;
    }

    @PutMapping("/rounds/{number}/timer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setTimer(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt,
                         @Valid @RequestBody TimerRequest body) {
        tables.setTimer(CurrentUser.from(jwt), id, number, body.minutes());
    }

    @PostMapping("/rounds/{number}/timer/start")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void start(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt) {
        tables.timer(CurrentUser.from(jwt), id, number, TableService.TimerAction.START);
    }

    @PostMapping("/rounds/{number}/timer/pause")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void pause(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt) {
        tables.timer(CurrentUser.from(jwt), id, number, TableService.TimerAction.PAUSE);
    }

    @PostMapping("/rounds/{number}/timer/add")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void add(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt,
                    @Valid @RequestBody AddTimeRequest body) {
        tables.addTime(CurrentUser.from(jwt), id, number, body.minutes());
    }

    @PostMapping("/matches/{matchId}/judge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void callJudge(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody(required = false) JudgeRequest body) {
        tables.callJudge(CurrentUser.from(jwt), id, matchId, body == null ? null : body.note());
    }

    @GetMapping("/judge-calls")
    public List<TableService.JudgeCallView> calls(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return tables.judgeCalls(CurrentUser.from(jwt), id);
    }

    @PostMapping("/judge-calls/{callId}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable UUID id, @PathVariable UUID callId, @AuthenticationPrincipal Jwt jwt) {
        tables.resolve(CurrentUser.from(jwt), id, callId);
    }
}
