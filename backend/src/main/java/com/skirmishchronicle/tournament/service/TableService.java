package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.tournament.domain.JudgeCall;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.repo.JudgeCallRepository;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Things happening at the tables during a round: the round timer and calls for the judge. */
@Service
public class TableService {

    private static final String AUDIT_TYPE = "TOURNAMENT";

    public record JudgeCallView(UUID id, UUID matchId, int roundNumber, int table, String players, String requestedBy,
                                String note, Instant createdAt, Instant resolvedAt) {
    }

    private final RoundRepository rounds;
    private final MatchRepository matches;
    private final JudgeCallRepository calls;
    private final UserRepository users;
    private final TournamentGuard guard;
    private final NotificationService notifications;
    private final com.skirmishchronicle.audit.AuditService audit;

    public TableService(RoundRepository rounds, MatchRepository matches, JudgeCallRepository calls,
                        UserRepository users, TournamentGuard guard, NotificationService notifications,
                        com.skirmishchronicle.audit.AuditService audit) {
        this.rounds = rounds;
        this.matches = matches;
        this.calls = calls;
        this.users = users;
        this.guard = guard;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ timer (organizer)

    public enum TimerAction { START, PAUSE }

    @Transactional
    public void setTimer(CurrentUser actor, UUID tournamentId, int number, Integer minutes) {
        guard.lockManaged(actor, tournamentId);
        TournamentRound r = round(tournamentId, number);
        if (r.getStatus() == RoundStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_COMPLETED");
        }
        if (minutes != null && (minutes < 1 || minutes > 600)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TIMER");
        }
        r.pauseTimer();
        r.setTimerMinutes(minutes);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TIMER_SET", "#" + number + ": " + minutes);
    }

    @Transactional
    public void timer(CurrentUser actor, UUID tournamentId, int number, TimerAction action) {
        guard.lockManaged(actor, tournamentId);
        TournamentRound r = round(tournamentId, number);
        if (r.getStatus() != RoundStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_IN_PROGRESS");
        }
        if (r.getTimerSeconds() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "TIMER_NOT_SET");
        }
        if (action == TimerAction.START) {
            r.startTimer();
        } else {
            r.pauseTimer();
        }
    }

    @Transactional
    public void addTime(CurrentUser actor, UUID tournamentId, int number, int minutes) {
        guard.lockManaged(actor, tournamentId);
        TournamentRound r = round(tournamentId, number);
        if (r.getTimerSeconds() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "TIMER_NOT_SET");
        }
        r.addTimerMinutes(minutes);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TIMER_ADJUSTED", "#" + number + ": " + minutes);
    }

    /** Announces the end of time to the players of the round and the organizer. */
    @Scheduled(fixedDelay = 15000, initialDelay = 30000)
    @Transactional
    public void announceTimeUp() {
        Instant now = Instant.now();
        for (TournamentRound r : rounds.findByTimerRunningSinceIsNotNullAndTimerNotifiedFalse()) {
            if (r.getStatus() != RoundStatus.IN_PROGRESS || !r.takeTimeUp(now)) {
                continue;
            }
            Tournament t = guard.lock(r.getTournamentId());
            Set<UUID> people = new HashSet<>();
            for (TournamentMatch m : matches.findByRoundIdOrderByTableNumberAsc(r.getId())) {
                if (!m.isBye()) {
                    people.add(m.getPlayerA());
                    people.add(m.getPlayerB());
                }
            }
            people.add(t.getOwnerId());
            notifications.notifyAll(people, NotificationType.TIME_UP,
                    Map.of("tournament", t.getName(), "round", r.getNumber()), "/tournaments/" + t.getId());
        }
    }

    // ------------------------------------------------------------------ judge calls

    @Transactional
    public void callJudge(CurrentUser actor, UUID tournamentId, UUID matchId, String note) {
        Tournament t = guard.lock(tournamentId);
        TournamentMatch m = matches.findById(matchId).filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MATCH_NOT_FOUND"));
        if (m.isBye() || !m.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        if (r.getStatus() != RoundStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_IN_PROGRESS");
        }
        if (calls.existsByMatchIdAndResolvedAtIsNull(matchId)) {
            throw new ApiException(HttpStatus.CONFLICT, "JUDGE_ALREADY_CALLED");
        }
        String clean = note == null || note.isBlank() ? null : note.strip();
        calls.save(new JudgeCall(tournamentId, matchId, actor.id(), clean));
        notifications.notify(t.getOwnerId(), NotificationType.JUDGE_CALL, Map.of("tournament", t.getName(),
                "round", r.getNumber(), "table", m.getTableNumber(),
                "players", name(m.getPlayerA()) + " – " + name(m.getPlayerB()), "note", clean == null ? "" : clean),
                "/tournaments/" + tournamentId + "/manage");
    }

    @Transactional(readOnly = true)
    public List<JudgeCallView> judgeCalls(CurrentUser actor, UUID tournamentId) {
        Tournament t = guard.visible(actor, tournamentId);
        TournamentGuard.requireManager(actor, t);
        List<JudgeCallView> out = new ArrayList<>();
        for (JudgeCall c : calls.findTop50ByTournamentIdOrderByCreatedAtDesc(tournamentId)) {
            TournamentMatch m = matches.findById(c.getMatchId()).orElse(null);
            if (m == null) {
                continue;
            }
            int roundNumber = rounds.findById(m.getRoundId()).map(TournamentRound::getNumber).orElse(0);
            out.add(new JudgeCallView(c.getId(), m.getId(), roundNumber, m.getTableNumber(),
                    name(m.getPlayerA()) + " – " + name(m.getPlayerB()), name(c.getRequestedBy()), c.getNote(),
                    c.getCreatedAt(), c.getResolvedAt()));
        }
        return out;
    }

    @Transactional
    public void resolve(CurrentUser actor, UUID tournamentId, UUID callId) {
        guard.lockManaged(actor, tournamentId);
        JudgeCall c = calls.findById(callId).filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "JUDGE_CALL_NOT_FOUND"));
        c.resolve(actor.id());
    }

    /** Matches of the tournament with an open judge call (for the round views). */
    @Transactional(readOnly = true)
    public Set<UUID> openCallMatches(UUID tournamentId) {
        Set<UUID> ids = new HashSet<>();
        calls.findByTournamentIdAndResolvedAtIsNull(tournamentId).forEach(c -> ids.add(c.getMatchId()));
        return ids;
    }

    private TournamentRound round(UUID tournamentId, int number) {
        return rounds.findByTournamentIdAndNumber(tournamentId, number)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ROUND_NOT_FOUND"));
    }

    private String name(UUID id) {
        return id == null ? "BYE" : users.findById(id).map(User::getDisplayName).orElse("?");
    }
}
