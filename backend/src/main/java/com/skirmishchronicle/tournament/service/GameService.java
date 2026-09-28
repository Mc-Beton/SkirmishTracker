package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.repo.JudgeCallRepository;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.MatchSchemeDraw;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.MatchTurnScore;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.SchemeDrawRepository;
import com.skirmishchronicle.tournament.repo.TurnScoreRepository;
import com.skirmishchronicle.tournament.repo.WarbandRepository;
import com.skirmishchronicle.tournament.domain.Warband;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Detailed game tracking: scenario of the round, scheme draws (d20 on the faction table, number of cards
 * by leader INT), victory points per turn and finishing the game (which reports the totals as the result).
 */
@Service
public class GameService {

    private static final String AUDIT_TYPE = "TOURNAMENT";
    private static final int MAX_TURN_VP = 100;

    public record CardView(String scheme, int roll) {
    }

    public record DrawView(String faction, int leaderInt, List<CardView> cards, String kept) {
    }

    public record TurnView(int turn, int scenarioVp, int schemeVp) {
    }

    public record PlayerGame(UUID userId, String displayName, DrawView draw, List<TurnView> turns,
                             int totalScenario, int totalScheme, int total, boolean canEdit,
                             String warbandFaction, Integer warbandLeaderInt) {
    }

    public record GameView(UUID matchId, int roundNumber, RoundStatus roundStatus, int table, MatchStatus status,
                           String scenario, int turns, List<PlayerGame> players, boolean bye,
                           Integer reportedA, Integer reportedB, UUID reportedBy, boolean canFinish,
                           boolean canSetScenario, RoundService.TimerView timer, boolean judgeCalled,
                           boolean canCallJudge) {
    }

    private final JudgeCallRepository judgeCalls;
    private final MatchRepository matches;
    private final RoundRepository rounds;
    private final SchemeDrawRepository draws;
    private final TurnScoreRepository turns;
    private final WarbandRepository warbands;
    private final UserRepository users;
    private final ContentService content;
    private final RoundService roundService;
    private final TournamentGuard guard;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public GameService(MatchRepository matches, RoundRepository rounds, SchemeDrawRepository draws,
                       TurnScoreRepository turns, WarbandRepository warbands, UserRepository users, ContentService content,
                       RoundService roundService, TournamentGuard guard, AuditService audit,
            JudgeCallRepository judgeCalls) {
        this.judgeCalls = judgeCalls;
        this.matches = matches;
        this.rounds = rounds;
        this.draws = draws;
        this.turns = turns;
        this.warbands = warbands;
        this.users = users;
        this.content = content;
        this.roundService = roundService;
        this.guard = guard;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public GameView view(CurrentUser viewer, UUID tournamentId, UUID matchId) {
        Tournament t = guard.visible(viewer, tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        boolean manager = TournamentGuard.canManage(viewer, t);
        if (r.getStatus() == RoundStatus.PAIRED && !manager) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MATCH_NOT_FOUND");
        }
        boolean editable = r.getStatus() == RoundStatus.IN_PROGRESS && m.getStatus() != MatchStatus.CONFIRMED;
        List<MatchSchemeDraw> matchDraws = draws.findByMatchId(matchId);
        List<MatchTurnScore> matchTurns = turns.findByMatchId(matchId);
        List<PlayerGame> players = new ArrayList<>();
        for (UUID player : m.isBye() ? List.of(m.getPlayerA()) : List.of(m.getPlayerA(), m.getPlayerB())) {
            MatchSchemeDraw d = matchDraws.stream().filter(x -> x.getUserId().equals(player)).findFirst().orElse(null);
            DrawView dv = d == null ? null : new DrawView(d.getFaction(), d.getLeaderInt(),
                    d.getCards().stream().map(c -> new CardView(c.scheme(), c.roll())).toList(), d.getKeptCode());
            List<TurnView> tv = new ArrayList<>();
            int sc = 0;
            int sh = 0;
            for (int turn = 1; turn <= content.turns(); turn++) {
                final int tn = turn;
                MatchTurnScore s = matchTurns.stream()
                        .filter(x -> x.getUserId().equals(player) && x.getTurn() == tn).findFirst().orElse(null);
                int a = s == null ? 0 : s.getScenarioVp();
                int b = s == null ? 0 : s.getSchemeVp();
                sc += a;
                sh += b;
                tv.add(new TurnView(turn, a, b));
            }
            boolean canEdit = editable && viewer != null && (manager || m.involves(viewer.id()));
            Warband wb = warbands.findByTournamentIdAndUserId(tournamentId, player).orElse(null);
            players.add(new PlayerGame(player, name(player), dv, tv, sc, sh, sc + sh, canEdit,
                    wb == null ? null : wb.getFaction(), wb == null ? null : wb.getLeaderInt()));
        }
        boolean participant = viewer != null && !m.isBye() && m.involves(viewer.id());
        return new GameView(m.getId(), r.getNumber(), r.getStatus(), m.getTableNumber(), m.getStatus(),
                r.getScenarioCode(), content.turns(), players, m.isBye(), m.getSmallA(), m.getSmallB(),
                m.getReportedBy(), editable && participant && !m.isBye(),
                manager && r.getStatus() != RoundStatus.COMPLETED,
                r.getTimerSeconds() == null ? null : new RoundService.TimerView(r.getTimerSeconds(),
                        r.remainingSeconds(java.time.Instant.now()), r.isTimerRunning(), java.time.Instant.now()),
                viewer != null && (participant || manager) && judgeCalls.existsByMatchIdAndResolvedAtIsNull(m.getId()),
                participant && r.getStatus() == RoundStatus.IN_PROGRESS);
    }

    // ------------------------------------------------------------------ organizer

    @Transactional
    public void setRoundScenario(CurrentUser actor, UUID tournamentId, int number, String scenarioCode) {
        guard.lockManaged(actor, tournamentId);
        if (scenarioCode != null && content.quest(scenarioCode).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SCENARIO_NOT_FOUND");
        }
        TournamentRound r = rounds.findByTournamentIdAndNumber(tournamentId, number)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ROUND_NOT_FOUND"));
        if (r.getStatus() == RoundStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_COMPLETED");
        }
        r.setScenarioCode(scenarioCode);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "ROUND_SCENARIO_SET",
                "#" + number + ": " + (scenarioCode == null ? "-" : scenarioCode));
    }

    @Transactional
    public void resetDraw(CurrentUser actor, UUID tournamentId, UUID matchId, UUID userId) {
        guard.lockManaged(actor, tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        draws.findByMatchIdAndUserId(m.getId(), userId).ifPresent(d -> {
            draws.delete(d);
            audit.record(actor.id(), AUDIT_TYPE, tournamentId, "SCHEME_DRAW_RESET", name(userId));
        });
    }

    // ------------------------------------------------------------------ players

    @Transactional
    public void drawSchemes(CurrentUser actor, UUID tournamentId, UUID matchId, String requestedFaction,
                            Integer requestedInt) {
        guard.lock(tournamentId);
        TournamentMatch m = editableMatch(tournamentId, matchId);
        requireParticipant(actor, m);
        // A submitted warband decides faction and leader INT; manual values are only a fallback.
        Warband wb = warbands.findByTournamentIdAndUserId(tournamentId, actor.id()).orElse(null);
        String faction = wb != null ? wb.getFaction() : requestedFaction;
        int leaderInt = wb != null ? wb.getLeaderInt() : requestedInt == null ? 0 : requestedInt;
        if (faction == null || faction.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FACTION_NOT_FOUND");
        }
        if (content.faction(faction).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FACTION_NOT_FOUND");
        }
        if (!content.hasSchemeTable(faction)) {
            // Oni Clans and Goblin Wartribes: d20 table not available yet.
            throw new ApiException(HttpStatus.CONFLICT, "SCHEME_TABLE_MISSING");
        }
        if (leaderInt < 1 || leaderInt > 30) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LEADER_INT");
        }
        if (draws.findByMatchIdAndUserId(matchId, actor.id()).isPresent()) {
            // One draw per player and game – no re-rolling until you like the result.
            throw new ApiException(HttpStatus.CONFLICT, "SCHEMES_ALREADY_DRAWN");
        }
        List<MatchSchemeDraw.Card> cards = content.drawSchemes(faction, leaderInt, random).stream()
                .map(c -> new MatchSchemeDraw.Card(c.scheme(), c.roll())).toList();
        draws.save(new MatchSchemeDraw(matchId, actor.id(), faction, leaderInt, cards));
    }

    @Transactional
    public void keepScheme(CurrentUser actor, UUID tournamentId, UUID matchId, String schemeCode) {
        guard.lock(tournamentId);
        TournamentMatch m = editableMatch(tournamentId, matchId);
        requireParticipant(actor, m);
        MatchSchemeDraw d = draws.findByMatchIdAndUserId(matchId, actor.id())
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "SCHEMES_NOT_DRAWN"));
        if (d.getKeptCode() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "SCHEME_ALREADY_CHOSEN");
        }
        boolean drawn = d.getCards().stream().anyMatch(c -> c.scheme().equals(schemeCode));
        if (!drawn) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SCHEME_NOT_DRAWN");
        }
        d.keep(schemeCode);
    }

    /** Either player of the game (or the organizer) edits a turn of either side. Earlier turns stay editable. */
    @Transactional
    public void saveTurn(CurrentUser actor, UUID tournamentId, UUID matchId, UUID playerId, int turn,
                         int scenarioVp, int schemeVp) {
        Tournament t = guard.lock(tournamentId);
        TournamentMatch m = editableMatch(tournamentId, matchId);
        if (m.isBye() || !m.involves(playerId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PLAYER_NOT_IN_MATCH");
        }
        boolean manager = TournamentGuard.canManage(actor, t);
        // Both players of the table may fill in either side (not everyone uses the app during the game).
        if (!manager && !m.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (turn < 1 || turn > content.turns()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TURN");
        }
        if (scenarioVp < 0 || schemeVp < 0 || scenarioVp > MAX_TURN_VP || schemeVp > MAX_TURN_VP) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE");
        }
        // Fill the row before saving: Hibernate inserts the state it had at persist time.
        MatchTurnScore s = turns.findByMatchIdAndUserIdAndTurn(matchId, playerId, turn)
                .orElseGet(() -> new MatchTurnScore(matchId, playerId, turn));
        s.set(scenarioVp, schemeVp, actor.id());
        turns.save(s);
        if (manager && !m.involves(actor.id())) {
            audit.record(actor.id(), AUDIT_TYPE, tournamentId, "TURN_SCORE_SET",
                    name(playerId) + " T" + turn + ": " + scenarioVp + "+" + schemeVp);
        }
    }

    /** Ends the detailed game: the per-turn totals are reported as the result; the opponent confirms as usual. */
    @Transactional
    public void finish(CurrentUser actor, UUID tournamentId, UUID matchId) {
        TournamentMatch m = editableMatch(tournamentId, matchId);
        requireParticipant(actor, m);
        List<MatchTurnScore> all = turns.findByMatchId(matchId);
        int a = total(all, m.getPlayerA());
        int b = total(all, m.getPlayerB());
        roundService.report(actor, tournamentId, matchId, a, b);
    }

    // ------------------------------------------------------------------ helpers

    private static int total(List<MatchTurnScore> all, UUID player) {
        return all.stream().filter(s -> s.getUserId().equals(player))
                .mapToInt(s -> s.getScenarioVp() + s.getSchemeVp()).sum();
    }

    private TournamentMatch editableMatch(UUID tournamentId, UUID matchId) {
        TournamentMatch m = matchOf(tournamentId, matchId);
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        if (r.getStatus() != RoundStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_IN_PROGRESS");
        }
        if (m.getStatus() == MatchStatus.CONFIRMED) {
            throw new ApiException(HttpStatus.CONFLICT, "RESULT_ALREADY_CONFIRMED");
        }
        return m;
    }

    private static void requireParticipant(CurrentUser actor, TournamentMatch m) {
        if (m.isBye() || !m.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
    }

    private TournamentMatch matchOf(UUID tournamentId, UUID matchId) {
        return matches.findById(matchId)
                .filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MATCH_NOT_FOUND"));
    }

    private String name(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse("?");
    }
}
