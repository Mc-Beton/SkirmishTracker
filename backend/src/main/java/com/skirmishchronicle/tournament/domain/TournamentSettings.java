package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.GameSystem;
import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import com.skirmishchronicle.pairing.PairingModels.SoftPreferences;
import java.util.List;

/** Pairing and scoring rules chosen by the organizer. */
public record TournamentSettings(
        FirstRoundMode firstRoundMode,
        boolean challengesEnabled,
        boolean challengesPublic,
        boolean avoidSameClub,
        boolean avoidSameFaction,
        boolean avoidSameCity,
        boolean softPrefsFirstRound,
        ScoringMode scoringMode,
        int winPoints,
        int drawPoints,
        int lossPoints,
        int smallPointsMultiplier,
        int byeBigPoints,
        int byeSmallPoints,
        int splitBigPoints,
        int splitSmallPoints,
        List<DifferenceRow> differenceTable,
        /** Players advancing from Swiss / round robin to a single-elimination bracket; 0 = no top cut. */
        int topCut,
        /** Players per team (2–5); null = individual tournament. */
        Integer teamSize,
        /** In a team, every player must use a different faction. */
        boolean teamUniqueFactions,
        /** Game system of the tournament (read only: chosen when the tournament is created). */
        GameSystem gameSystem,
        /** Two score slots per game: scenario points and secondary points (secondaries break a scenario tie). */
        boolean secondarySlot,
        /** Upper limits of the score slots per game (null = up to the global maximum). */
        Integer maxPrimaryPoints,
        Integer maxSecondaryPoints) {

    public boolean teams() {
        return teamSize != null;
    }

    public static final List<Integer> TOP_CUTS = List.of(0, 2, 4, 8, 16, 32);

    public SoftPreferences softPreferences() {
        return new SoftPreferences(avoidSameClub, avoidSameFaction, avoidSameCity);
    }

    /**
     * Standings order: Bolt Action ranks by tournament points, then scenario points, then secondary points;
     * Eldfall by wins, then big points, then small points.
     */
    public boolean pointsFirst() {
        return gameSystem == GameSystem.BOLT_ACTION;
    }

    /**
     * Result of a played game for side A: 1 won, 0 draw, -1 lost. Scenario (small) points decide; secondary
     * points only break a tie (two-slot scoring – they are null otherwise).
     */
    public static int outcome(int smallA, int smallB, Integer secondaryA, Integer secondaryB) {
        int c = Integer.compare(smallA, smallB);
        if (c == 0 && secondaryA != null && secondaryB != null) {
            c = Integer.compare(secondaryA, secondaryB);
        }
        return Integer.signum(c);
    }

    /** Big points for one side of a played game whose result for that side is {@code sign} (see outcome). */
    public int bigPointsForResult(int mySmall, int opponentSmall, int sign) {
        if (scoringMode == ScoringMode.WIN_DRAW_LOSS) {
            return sign > 0 ? winPoints : sign == 0 ? drawPoints : lossPoints;
        }
        return bigPointsForGame(mySmall, opponentSmall);
    }

    /** Big points for one side of a played game. */
    public int bigPointsForGame(int mySmall, int opponentSmall) {
        return switch (scoringMode) {
            case WIN_DRAW_LOSS -> mySmall > opponentSmall ? winPoints : mySmall == opponentSmall ? drawPoints : lossPoints;
            case SMALL_POINTS_MULTIPLIER -> mySmall * smallPointsMultiplier;
            case DIFFERENCE_TABLE -> fromTable(mySmall - opponentSmall);
        };
    }

    private int fromTable(int diff) {
        int abs = Math.abs(diff);
        for (DifferenceRow row : differenceTable) {
            if (row.upTo() == null || abs <= row.upTo()) {
                if (diff == 0) {
                    // Exact draw: both sides get the same (the average of the row, rounded down).
                    return (row.winner() + row.loser()) / 2;
                }
                return diff > 0 ? row.winner() : row.loser();
            }
        }
        return 0;
    }
}
