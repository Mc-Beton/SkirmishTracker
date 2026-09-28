package com.skirmishchronicle.notification;

/** Kinds of notifications; the client translates {@code notifications.types.<TYPE>} with the params. */
public enum NotificationType {
    // tournament
    ROUND_STARTED,
    TIME_UP,
    RESULT_TO_CONFIRM,
    RESULT_RECORDED,
    RESULT_SET_BY_ORGANIZER,
    // registration & lists
    CHALLENGE_RECEIVED,
    LIST_STATUS_CHANGED,
    PROMOTED_FROM_WAITLIST,
    TEAM_INVITATION,
    LINEUP_REQUIRED,
    // own games & leagues
    GAME_TO_CONFIRM,
    GAME_CONFIRMED,
    GAME_REJECTED,
    LEAGUE_SUBMISSION,
    LEAGUE_DECISION,
    // organizer
    NEW_REGISTRATION,
    RESULT_DISPUTED,
    WARBAND_SUBMITTED,
    JUDGE_CALL
}
