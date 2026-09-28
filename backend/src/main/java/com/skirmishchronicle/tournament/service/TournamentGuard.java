package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.repo.TournamentRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Loading and authorization rules shared by the tournament services. */
@Component
public class TournamentGuard {

    private final TournamentRepository tournaments;

    public TournamentGuard(TournamentRepository tournaments) {
        this.tournaments = tournaments;
    }

    public static boolean canManage(CurrentUser viewer, Tournament t) {
        return viewer != null && (viewer.admin() || t.isOwnedBy(viewer.id()));
    }

    /** Public read: drafts only exist for the organizer. */
    public Tournament visible(CurrentUser viewer, UUID id) {
        Tournament t = tournaments.findById(id).orElseThrow(TournamentGuard::notFound);
        if (!t.getStatus().isPublic() && !canManage(viewer, t)) {
            throw notFound();
        }
        return t;
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

    public static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "TOURNAMENT_NOT_FOUND");
    }
}
