package com.skirmishchronicle.tournament.domain;

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
        boolean teamUniqueFactions) {

    public boolean teams() {
        return teamSize != null;
    }

    public static final List<Integer> TOP_CUTS = List.of(0, 2, 4, 8, 16, 32);

    public SoftPreferences softPreferences() {
        return new SoftPreferences(avoidSameClub, avoidSameFaction, avoidSameCity);
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
