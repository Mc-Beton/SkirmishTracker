package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.service.ChallengeService;
import com.skirmishchronicle.tournament.service.RoundService;
import com.skirmishchronicle.tournament.web.TournamentRequests.ByePointsRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.ChallengeRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.FixedPairRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.PenaltyRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.ResultRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.ScoreRequest;
import com.skirmishchronicle.tournament.web.TournamentRequests.SwapRequest;
import jakarta.validation.Valid;
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

/** Challenges, rounds, results, standings and penalties of a tournament. */
@RestController
@RequestMapping("/api/tournaments/{id}")
public class RoundController {

    private final RoundService rounds;
    private final ChallengeService challenges;

    public RoundController(RoundService rounds, ChallengeService challenges) {
        this.rounds = rounds;
        this.challenges = challenges;
    }

    private static CurrentUser user(Jwt jwt) {
        return CurrentUser.from(jwt);
    }

    // ------------------------------------------------ challenges & fixed pairs (round 1)

    @GetMapping("/challenges")
    public List<ChallengeService.ChallengeView> challenges(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return challenges.list(user(jwt), id);
    }

    @PostMapping("/challenges")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void challenge(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody ChallengeRequest body) {
        challenges.challenge(user(jwt), id, body.challengedUserId());
    }

    @PostMapping("/challenges/{challengeId}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@PathVariable UUID id, @PathVariable UUID challengeId, @AuthenticationPrincipal Jwt jwt) {
        challenges.accept(user(jwt), id, challengeId);
    }

    @PostMapping("/challenges/{challengeId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable UUID id, @PathVariable UUID challengeId, @AuthenticationPrincipal Jwt jwt) {
        challenges.reject(user(jwt), id, challengeId);
    }

    @PostMapping("/challenges/{challengeId}/withdraw")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable UUID id, @PathVariable UUID challengeId, @AuthenticationPrincipal Jwt jwt) {
        challenges.withdraw(user(jwt), id, challengeId);
    }

    @PostMapping("/fixed-pairs")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void fixedPair(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody FixedPairRequest body) {
        challenges.createFixedPair(user(jwt), id, body.playerA(), body.playerB());
    }

    @DeleteMapping("/challenges/{challengeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelPair(@PathVariable UUID id, @PathVariable UUID challengeId, @AuthenticationPrincipal Jwt jwt) {
        challenges.cancelPair(user(jwt), id, challengeId);
    }

    // ------------------------------------------------ rounds

    @GetMapping("/rounds")
    public List<RoundService.RoundView> rounds(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return rounds.rounds(user(jwt), id);
    }

    @PostMapping("/rounds")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Integer> generate(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return Map.of("number", rounds.generateNextRound(user(jwt), id));
    }

    @PostMapping("/rounds/{number}/swap")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void swap(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt,
                     @Valid @RequestBody SwapRequest body) {
        rounds.swapPlayers(user(jwt), id, number, body.playerX(), body.playerY());
    }

    @PostMapping("/rounds/{number}/start")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void start(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt) {
        rounds.startRound(user(jwt), id, number);
    }

    @PostMapping("/rounds/{number}/complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void complete(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt) {
        rounds.completeRound(user(jwt), id, number);
    }

    @DeleteMapping("/rounds/{number}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void discard(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt) {
        rounds.discardRound(user(jwt), id, number);
    }

    @PutMapping("/rounds/{number}/bye-points")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void byePoints(@PathVariable UUID id, @PathVariable int number, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody ByePointsRequest body) {
        rounds.setByePoints(user(jwt), id, number, body.bigPoints(), body.smallPoints());
    }

    @PostMapping("/finish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void finish(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        rounds.finishTournament(user(jwt), id);
    }

    // ------------------------------------------------ results

    @PostMapping("/matches/{matchId}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt,
                       @Valid @RequestBody ScoreRequest body) {
        rounds.report(user(jwt), id, matchId, body.smallA(), body.smallB());
    }

    @PostMapping("/matches/{matchId}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirm(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt) {
        rounds.confirm(user(jwt), id, matchId);
    }

    @PostMapping("/matches/{matchId}/dispute")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dispute(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt) {
        rounds.dispute(user(jwt), id, matchId);
    }

    @PutMapping("/matches/{matchId}/result")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setResult(@PathVariable UUID id, @PathVariable UUID matchId, @AuthenticationPrincipal Jwt jwt,
                          @Valid @RequestBody ResultRequest body) {
        rounds.setResult(user(jwt), id, matchId, body.type(), body.smallA(), body.smallB());
    }

    // ------------------------------------------------ standings & penalties

    @GetMapping("/standings")
    public RoundService.StandingsView standings(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return rounds.standings(user(jwt), id);
    }

    @PostMapping("/penalties")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addPenalty(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                           @Valid @RequestBody PenaltyRequest body) {
        rounds.addPenalty(user(jwt), id, body.userId(), body.bigPoints(), body.reason());
    }

    @DeleteMapping("/penalties/{penaltyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removePenalty(@PathVariable UUID id, @PathVariable UUID penaltyId, @AuthenticationPrincipal Jwt jwt) {
        rounds.removePenalty(user(jwt), id, penaltyId);
    }
}
