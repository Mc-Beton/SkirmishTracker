package com.skirmishchronicle.tournament.web;

import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.tournament.domain.DifferenceRow;
import com.skirmishchronicle.tournament.domain.ListStatus;
import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.RoundPairing;
import com.skirmishchronicle.tournament.domain.ScoringMode;
import com.skirmishchronicle.tournament.domain.TableOrder;
import com.skirmishchronicle.tournament.service.TournamentViews;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import com.skirmishchronicle.tournament.domain.TournamentDetails;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentRank;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TournamentRequests {

    private TournamentRequests() {
    }

    public record TournamentRequest(
            @NotBlank @Size(min = 3, max = 120) String name,
            @Size(max = 10000) String description,
            @NotNull Instant startsAt,
            Instant endsAt,
            @Size(max = 120) String venueName,
            @Size(max = 200) String address,
            @NotBlank @Size(max = 80) String city,
            @Pattern(regexp = "^[A-Z]{2}$") String country,
            @DecimalMin("0") @DecimalMax("100000") @Digits(integer = 8, fraction = 2) BigDecimal entryFeeAmount,
            @Pattern(regexp = "^[A-Z]{3}$") String entryFeeCurrency,
            @NotNull TournamentRank rank,
            @NotNull TournamentFormat format,
            @Min(2) @Max(512) Integer maxPlayers,
            @Min(1) @Max(10000) Integer pointsLimit,
            @Min(1) @Max(20) Integer roundsPlanned,
            Instant listDeadline,
            FirstRoundMode firstRoundMode,
            Boolean challengesEnabled,
            Boolean challengesPublic,
            Boolean avoidSameClub,
            Boolean avoidSameFaction,
            Boolean avoidSameCity,
            Boolean softPrefsFirstRound,
            ScoringMode scoringMode,
            @Min(0) @Max(1000) Integer winPoints,
            @Min(0) @Max(1000) Integer drawPoints,
            @Min(0) @Max(1000) Integer lossPoints,
            @Min(1) @Max(100) Integer smallPointsMultiplier,
            @Min(0) @Max(1000) Integer byeBigPoints,
            @Min(0) @Max(1000) Integer byeSmallPoints,
            @Min(0) @Max(1000) Integer splitBigPoints,
            @Min(0) @Max(1000) Integer splitSmallPoints,
            @Size(max = 30) List<@Valid DifferenceRowRequest> differenceTable,
            Integer topCut,
            @Min(2) @Max(5) Integer teamSize,
            Boolean teamUniqueFactions,
            @Size(max = 30) List<@Valid RoundPlanRequest> roundPlans) {

        /** Null = keep the current plan (older clients); empty = no plan. */
        public List<TournamentViews.RoundPlan> toPlans() {
            return roundPlans == null ? null : roundPlans.stream()
                    .map(p -> new TournamentViews.RoundPlan(p.number(),
                            p.scenarioCode() == null || p.scenarioCode().isBlank() ? null : p.scenarioCode(),
                            p.pairing(), p.tableOrder() == null ? TableOrder.BY_STANDINGS : p.tableOrder(),
                            p.softPreferences(), p.durationMinutes()))
                    .toList();
        }

        /** Missing values fall back to the defaults (3/1/0, BYE 3, SPLIT 1, random first round). */
        public TournamentSettings toSettings() {
            return new TournamentSettings(
                    firstRoundMode == null ? FirstRoundMode.RANDOM : firstRoundMode,
                    Boolean.TRUE.equals(challengesEnabled),
                    challengesPublic == null || challengesPublic,
                    Boolean.TRUE.equals(avoidSameClub),
                    Boolean.TRUE.equals(avoidSameFaction),
                    Boolean.TRUE.equals(avoidSameCity),
                    Boolean.TRUE.equals(softPrefsFirstRound),
                    scoringMode == null ? ScoringMode.WIN_DRAW_LOSS : scoringMode,
                    or(winPoints, 3), or(drawPoints, 1), or(lossPoints, 0), or(smallPointsMultiplier, 2),
                    or(byeBigPoints, 3), or(byeSmallPoints, 0), or(splitBigPoints, 1), or(splitSmallPoints, 0),
                    differenceTable == null || differenceTable.isEmpty()
                            ? DifferenceRow.parse(DifferenceRow.DEFAULT)
                            : differenceTable.stream()
                                    .map(r -> new DifferenceRow(r.upTo(), r.winner(), r.loser())).toList(),
                    or(topCut, 0), teamSize, Boolean.TRUE.equals(teamUniqueFactions));
        }

        private static int or(Integer value, int fallback) {
            return value == null ? fallback : value;
        }

        public TournamentDetails toDetails() {
            return new TournamentDetails(name, blankToNull(description), startsAt, endsAt, blankToNull(venueName),
                    blankToNull(address), city, country, entryFeeAmount, entryFeeCurrency, rank, format, maxPlayers,
                    pointsLimit, roundsPlanned, listDeadline);
        }

        private static String blankToNull(String s) {
            return s == null || s.isBlank() ? null : s.trim();
        }
    }

    public record RoundPlanRequest(@NotNull @Min(1) @Max(30) Integer number, @Size(max = 60) String scenarioCode,
                                   RoundPairing pairing, TableOrder tableOrder, Boolean softPreferences,
                                   @Min(5) @Max(600) Integer durationMinutes) {
    }

    public record DifferenceRowRequest(@Min(0) @Max(10000) Integer upTo,
                                       @NotNull @Min(0) @Max(1000) Integer winner,
                                       @NotNull @Min(0) @Max(1000) Integer loser) {
    }

    public record FixedPairRequest(@NotNull UUID playerA, @NotNull UUID playerB) {
    }

    public record ChallengeRequest(@NotNull UUID challengedUserId) {
    }

    public record ScoreRequest(@NotNull @Min(0) @Max(1000) Integer smallA, @NotNull @Min(0) @Max(1000) Integer smallB) {
    }

    public record ResultRequest(@NotNull MatchResultType type, @Min(0) @Max(1000) Integer smallA,
                                @Min(0) @Max(1000) Integer smallB) {
    }

    public record SwapRequest(@NotNull UUID playerX, @NotNull UUID playerY) {
    }

    public record ByePointsRequest(@NotNull @Min(0) @Max(1000) Integer bigPoints,
                                   @NotNull @Min(0) @Max(1000) Integer smallPoints) {
    }

    public record PenaltyRequest(@NotNull UUID userId, @NotNull @Min(1) @Max(1000) Integer bigPoints,
                                 @NotBlank @Size(max = 300) String reason) {
    }

    public record AddPlayerRequest(@NotBlank @Size(max = 32) String displayName) {
    }

    public record UpdateParticipantRequest(Boolean paid, ListStatus listStatus) {
    }
}
