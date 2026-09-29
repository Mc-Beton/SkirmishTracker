package com.skirmishchronicle.analytics;

import java.time.LocalDate;
import java.util.List;

/** Aggregated meta statistics for the publisher panel. Only aggregates – never single players. */
public record MetaReport(Summary summary, List<FactionRow> factions, List<Cell> matchups, List<UnitRow> units,
                         List<MissionRow> missions, List<Cell> factionMissions, List<MonthRow> months,
                         Thresholds thresholds) {

    /**
     * @param hiddenRows rows left out because fewer than {@link Thresholds#minPlayers()} players stand behind them
     */
    public record Summary(int games, int players, int tournaments, int tournamentGames, int ownGames,
                          int gamesWithFactions, int gamesWithLists, int gamesWithMission, int mirrorGames,
                          int draws, LocalDate first, LocalDate last, int hiddenRows) {
    }

    /**
     * Result of a group of sides. {@code score} = (wins + draws / 2) / n with a 95% Wilson interval
     * [{@code low}, {@code high}]; {@code expected} = mean score the ELO ratings predicted; {@code performance} =
     * score − expected (positive: the group wins more than its players' ratings explain).
     */
    public record Rate(int n, int wins, int draws, int losses, double score, double low, double high,
                       double expected, double performance, boolean enough) {
    }

    /** {@code share}: part of all sides with a known faction (mirror games included); rate excludes mirrors. */
    public record FactionRow(String faction, int players, int sides, double share, double avgElo, Rate rate) {
    }

    /** Matchup (row faction vs column faction) or faction × mission; rate from the row's point of view. */
    public record Cell(String row, String col, int players, Rate rate) {
    }

    /**
     * A character within one faction: {@code pickRate} = part of that faction's lists containing it;
     * {@code with} / {@code without} compare the faction's results with and without the character.
     */
    public record UnitRow(String faction, String unit, int players, double pickRate, Rate with, Rate without) {
    }

    public record MissionRow(String mission, int games, int players, double drawRate, double avgWinnerVp,
                             double avgLoserVp, double avgMargin) {
    }

    /** {@code newPlayers}: players whose first rated game ever was in this month. */
    public record MonthRow(String month, int games, int activePlayers, int newPlayers, int tournaments) {
    }

    /** {@code minPlayers}: privacy threshold per row; {@code minSample}: below it a rate is marked as uncertain. */
    public record Thresholds(int minPlayers, int minSample) {
    }
}
