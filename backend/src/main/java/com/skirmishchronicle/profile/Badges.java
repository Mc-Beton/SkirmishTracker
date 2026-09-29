package com.skirmishchronicle.profile;

import java.util.List;

/**
 * Achievement badges, computed from a player's record (nothing stored). Every badge has a target, so the
 * profile can show locked badges with progress.
 */
public final class Badges {

    public record Badge(String code, boolean earned, int progress, int target) {
    }

    /** What the badges are computed from. */
    public record Input(int games, int bestWinStreak, int tournamentWins, int podiums, int countries,
                        int maxFactionWins, int factionsPlayed, boolean giantSlayer, int organizedFinished,
                        int officialWins) {
    }

    /** ELO gap (opponent − player, before the game) that makes a win a "giant slayer" win. */
    public static final int GIANT_GAP = 150;

    private Badges() {
    }

    public static List<Badge> of(Input in) {
        return List.of(
                badge("FIRST_GAME", in.games(), 1),
                badge("VETERAN", in.games(), 25),
                badge("LEGEND", in.games(), 100),
                badge("WIN_STREAK", in.bestWinStreak(), 5),
                badge("GIANT_SLAYER", in.giantSlayer() ? 1 : 0, 1),
                badge("TOURNAMENT_WINNER", in.tournamentWins(), 1),
                badge("PODIUM", in.podiums(), 3),
                badge("OFFICIAL_CHAMPION", in.officialWins(), 1),
                badge("GLOBETROTTER", in.countries(), 3),
                badge("FACTION_MASTER", in.maxFactionWins(), 10),
                badge("ALL_ROUNDER", in.factionsPlayed(), 5),
                badge("ORGANIZER", in.organizedFinished(), 1));
    }

    private static Badge badge(String code, int progress, int target) {
        return new Badge(code, progress >= target, Math.min(progress, target), target);
    }

    /** Longest run of consecutive wins in a chronological list of scores (1 win, 0.5 draw, 0 loss). */
    public static int bestWinStreak(List<Double> scores) {
        int best = 0;
        int run = 0;
        for (double s : scores) {
            run = s == 1.0 ? run + 1 : 0;
            best = Math.max(best, run);
        }
        return best;
    }
}
