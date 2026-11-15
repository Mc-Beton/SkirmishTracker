package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Loading and authorization rules shared by the tournament services. */
@Component
public class TournamentGuard {

    private final TournamentRepository tournaments;
    private final ParticipantRepository participants;

    public TournamentGuard(TournamentRepository tournaments, ParticipantRepository participants) {
        this.tournaments = tournaments;
        this.participants = participants;
    }

    public static boolean canManage(CurrentUser viewer, Tournament t) {
        return viewer != null && (viewer.admin() || t.isManagedBy(viewer.id()));
    }

    /** Public read: drafts only exist for the organizer. */
    public Tournament visible(CurrentUser viewer, UUID id) {
        Tournament t = tournaments.findById(id).orElseThrow(TournamentGuard::notFound);
        if (!canSee(viewer, t)) {
            throw notFound();
        }
        return t;
    }

    /**
     * Drafts exist only for the organizers; a test tournament (whatever its status) only for its organizers and
     * the players they invited.
     */
    public boolean canSee(CurrentUser viewer, Tournament t) {
        if (canManage(viewer, t)) {
            return true;
        }
        if (t.isTest()) {
            return viewer != null && participants.findByTournamentIdAndUserId(t.getId(), viewer.id()).isPresent();
        }
        return t.getStatus().isPublic();
    }

    /** Row-locked load for any state-changing operation on the tournament. */
    public Tournament lock(UUID id) {
        return tournaments.findByIdForUpdate(id).orElseThrow(TournamentGuard::notFound);
    }

    public Tournament lockManaged(CurrentUser actor, UUID id) {
        Tournament t = lock(id);
        requireManager(actor, t);
        return t;
    }

    public static void requireManager(CurrentUser actor, Tournament t) {
        if (!canManage(actor, t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
    }

    /**
     * Eldfall-only features (warbands, scheme draws, turn-by-turn scoring, rosters, teams): a Bolt Action
     * tournament enters only the final score of each game.
     */
    public static void requireEldfall(Tournament t) {
        if (t.isBoltAction()) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_AVAILABLE_FOR_GAME_SYSTEM");
        }
    }

    public static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND");
    }
}
