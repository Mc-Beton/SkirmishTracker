package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.ChallengeStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentChallenge;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ChallengeRepository;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * First-round challenges. Rules:
 * <ul>
 *   <li>only confirmed (not waitlisted) players, only before round 1 is paired, only if the organizer enabled it;</li>
 *   <li>a player has at most one open challenge: no new challenge while one sent or received is pending;</li>
 *   <li>accepting creates a fixed first-round pair and cancels every other pending challenge of both players.</li>
 * </ul>
 * Organizer-made pairs use the same table (organizerMade = true) and work regardless of the challenge setting.
 */
@Service
public class ChallengeService {

    private static final String AUDIT_TYPE = "TOURNAMENT";
    private static final Set<ChallengeStatus> OPEN = EnumSet.of(ChallengeStatus.PENDING, ChallengeStatus.ACCEPTED);

    public record ChallengeView(UUID id, UUID challengerId, String challengerName, UUID challengedId,
                                String challengedName, ChallengeStatus status, boolean organizerMade) {
    }

    private final NotificationService notifications;
    private final ChallengeRepository challenges;
    private final ParticipantRepository participants;
    private final RoundRepository rounds;
    private final UserRepository users;
    private final TournamentGuard guard;
    private final AuditService audit;

    public ChallengeService(ChallengeRepository challenges, ParticipantRepository participants,
                            RoundRepository rounds, UserRepository users, TournamentGuard guard, AuditService audit,
            NotificationService notifications) {
        this.notifications = notifications;
        this.challenges = challenges;
        this.participants = participants;
        this.rounds = rounds;
        this.users = users;
        this.guard = guard;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ChallengeView> list(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        boolean manager = TournamentGuard.canManage(viewer, t);
        List<TournamentChallenge> open = challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN);
        List<TournamentChallenge> visible = open.stream().filter(c -> {
            if (manager) {
                return true;
            }
            boolean mine = viewer != null && c.involves(viewer.id());
            // Pending challenges are private; accepted pairs are public if the organizer chose so.
            return mine || (c.getStatus() == ChallengeStatus.ACCEPTED && t.settings().challengesPublic());
        }).toList();
        Set<UUID> ids = new HashSet<>();
        visible.forEach(c -> {
            ids.add(c.getChallengerId());
            ids.add(c.getChallengedId());
        });
        Map<UUID, String> names = users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
        return visible.stream().map(c -> new ChallengeView(c.getId(), c.getChallengerId(),
                names.getOrDefault(c.getChallengerId(), "?"), c.getChallengedId(),
                names.getOrDefault(c.getChallengedId(), "?"), c.getStatus(), c.isOrganizerMade())).toList();
    }

    @Transactional
    public void challenge(CurrentUser actor, UUID tournamentId, UUID challengedId) {
        Tournament t = guard.lock(tournamentId);
        requireChallengeWindow(t);
        if (!t.settings().challengesEnabled()) {
            throw new ApiException(HttpStatus.CONFLICT, "CHALLENGES_DISABLED");
        }
        if (actor.id().equals(challengedId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_CHALLENGE_SELF");
        }
        requireConfirmed(tournamentId, actor.id());
        requireConfirmed(tournamentId, challengedId);
        List<TournamentChallenge> open = challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN);
        for (TournamentChallenge c : open) {
            if (c.involves(actor.id())) {
                // One open challenge per player: pending (sent or received) or already paired.
                throw new ApiException(HttpStatus.CONFLICT,
                        c.getStatus() == ChallengeStatus.ACCEPTED ? "ALREADY_PAIRED" : "OPEN_CHALLENGE_EXISTS");
            }
            if (c.getStatus() == ChallengeStatus.ACCEPTED && c.involves(challengedId)) {
                throw new ApiException(HttpStatus.CONFLICT, "OPPONENT_ALREADY_PAIRED");
            }
        }
        challenges.save(new TournamentChallenge(tournamentId, actor.id(), challengedId, false));
        notifications.notify(challengedId, NotificationType.CHALLENGE_RECEIVED, java.util.Map.of(
                "tournament", t.getName(), "player", displayName(actor.id())), "/tournaments/" + tournamentId);
    }

    @Transactional
    public void accept(CurrentUser actor, UUID tournamentId, UUID challengeId) {
        Tournament t = guard.lock(tournamentId);
        requireChallengeWindow(t);
        TournamentChallenge c = pendingOf(tournamentId, challengeId);
        if (!c.getChallengedId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        List<TournamentChallenge> open = challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN);
        for (TournamentChallenge other : open) {
            if (other.getStatus() == ChallengeStatus.ACCEPTED
                    && (other.involves(c.getChallengerId()) || other.involves(c.getChallengedId()))) {
                throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PAIRED");
            }
        }
        c.resolve(ChallengeStatus.ACCEPTED);
        cancelPendingOf(open, c, c.getChallengerId(), c.getChallengedId());
    }

    @Transactional
    public void reject(CurrentUser actor, UUID tournamentId, UUID challengeId) {
        guard.lock(tournamentId);
        TournamentChallenge c = pendingOf(tournamentId, challengeId);
        if (!c.getChallengedId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        c.resolve(ChallengeStatus.REJECTED);
    }

    @Transactional
    public void withdraw(CurrentUser actor, UUID tournamentId, UUID challengeId) {
        guard.lock(tournamentId);
        TournamentChallenge c = pendingOf(tournamentId, challengeId);
        if (!c.getChallengerId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        c.resolve(ChallengeStatus.WITHDRAWN);
    }

    /** Organizer sets a fixed first-round pair (independent of the challenge setting). */
    @Transactional
    public void createFixedPair(CurrentUser actor, UUID tournamentId, UUID playerA, UUID playerB) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        requireChallengeWindow(t);
        if (playerA.equals(playerB)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_CHALLENGE_SELF");
        }
        requireConfirmed(tournamentId, playerA);
        requireConfirmed(tournamentId, playerB);
        List<TournamentChallenge> open = challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN);
        for (TournamentChallenge c : open) {
            if (c.getStatus() == ChallengeStatus.ACCEPTED && (c.involves(playerA) || c.involves(playerB))) {
                throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PAIRED");
            }
        }
        TournamentChallenge pair = new TournamentChallenge(tournamentId, playerA, playerB, true);
        challenges.save(pair);
        cancelPendingOf(open, pair, playerA, playerB);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "FIXED_PAIR_CREATED", names(playerA, playerB));
    }

    /** Organizer removes an accepted challenge or fixed pair. */
    @Transactional
    public void cancelPair(CurrentUser actor, UUID tournamentId, UUID challengeId) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        requireChallengeWindow(t);
        TournamentChallenge c = challenges.findById(challengeId)
                .filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CHALLENGE_NOT_FOUND"));
        if (!OPEN.contains(c.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "CHALLENGE_NOT_OPEN");
        }
        c.resolve(ChallengeStatus.CANCELLED);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "FIXED_PAIR_REMOVED",
                names(c.getChallengerId(), c.getChallengedId()));
    }

    /** Called when a player leaves the tournament: their challenges no longer make sense. */
    @Transactional
    public void cancelAllOf(UUID tournamentId, UUID userId) {
        challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN).stream()
                .filter(c -> c.involves(userId))
                .forEach(c -> c.resolve(ChallengeStatus.CANCELLED));
    }

    /** Called when round 1 is paired: pending challenges expire, accepted ones become pairings. */
    @Transactional
    public List<TournamentChallenge> closeForPairing(UUID tournamentId) {
        List<TournamentChallenge> open = challenges.findByTournamentIdAndStatusIn(tournamentId, OPEN);
        open.stream().filter(c -> c.getStatus() == ChallengeStatus.PENDING)
                .forEach(c -> c.resolve(ChallengeStatus.CANCELLED));
        return open.stream().filter(c -> c.getStatus() == ChallengeStatus.ACCEPTED).toList();
    }

    private void requireChallengeWindow(Tournament t) {
        boolean beforeStart = t.getStatus() == TournamentStatus.PUBLISHED
                || t.getStatus() == TournamentStatus.REGISTRATION_CLOSED
                || t.getStatus() == TournamentStatus.DRAFT;
        if (!beforeStart || rounds.countByTournamentId(t.getId()) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "CHALLENGES_CLOSED");
        }
    }

    private void requireConfirmed(UUID tournamentId, UUID userId) {
        boolean confirmed = participants.findByTournamentIdAndUserId(tournamentId, userId)
                .map(p -> p.getStatus() == ParticipantStatus.REGISTERED)
                .orElse(false);
        if (!confirmed) {
            throw new ApiException(HttpStatus.CONFLICT, "PLAYER_NOT_CONFIRMED");
        }
    }

    private TournamentChallenge pendingOf(UUID tournamentId, UUID challengeId) {
        TournamentChallenge c = challenges.findById(challengeId)
                .filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CHALLENGE_NOT_FOUND"));
        if (c.getStatus() != ChallengeStatus.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "CHALLENGE_NOT_OPEN");
        }
        return c;
    }

    private static void cancelPendingOf(List<TournamentChallenge> open, TournamentChallenge keep, UUID a, UUID b) {
        open.stream()
                .filter(o -> o != keep && o.getStatus() == ChallengeStatus.PENDING && (o.involves(a) || o.involves(b)))
                .forEach(o -> o.resolve(ChallengeStatus.CANCELLED));
    }

    private String displayName(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse("?");
    }

    private String names(UUID a, UUID b) {
        String na = users.findById(a).map(User::getDisplayName).orElse("?");
        String nb = users.findById(b).map(User::getDisplayName).orElse("?");
        return na + " vs " + nb;
    }
}
