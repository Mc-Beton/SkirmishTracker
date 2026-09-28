package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.tournament.repo.JudgeCallRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.pairing.KnockoutBracket;
import com.skirmishchronicle.rating.RatingService;
import com.skirmishchronicle.pairing.PairingModels;
import com.skirmishchronicle.pairing.RoundRobinSchedule;
import com.skirmishchronicle.pairing.PairingModels.NoValidPairingException;
import com.skirmishchronicle.pairing.PairingModels.Pair;
import com.skirmishchronicle.pairing.PairingModels.Player;
import com.skirmishchronicle.pairing.SwissPairer;
import com.skirmishchronicle.tournament.domain.MatchResultType;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.RoundPairing;
import com.skirmishchronicle.tournament.domain.RoundPhase;
import com.skirmishchronicle.tournament.domain.TableOrder;
import com.skirmishchronicle.tournament.domain.TournamentRoundPlan;
import com.skirmishchronicle.tournament.repo.RoundPlanRepository;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentFormat;
import com.skirmishchronicle.tournament.domain.TournamentChallenge;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentPenalty;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.TournamentSettings;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.PenaltyRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Rounds, pairings, results and standings. Formats: Swiss, round robin (fixed schedule) and single elimination;
 * Swiss and round robin can end with a top cut (the best N go to a knockout bracket).
 */
@Service
public class RoundService {

    private static final String AUDIT_TYPE = "TOURNAMENT";
    private static final int MAX_SMALL_POINTS = 1000;

    // ------------------------------------------------------------------ read models

    public record PlayerRef(UUID id, String displayName) {
    }

    /** seedA/seedB and advancing: knockout rounds only (advancing = winner once the result is confirmed). */
    public record MatchView(UUID id, int table, PlayerRef playerA, PlayerRef playerB, MatchStatus status,
                            MatchResultType resultType, Integer smallA, Integer smallB, Integer bigA, Integer bigB,
                            UUID reportedBy, boolean rematch, boolean canReport, boolean canConfirm,
                            Integer seedA, Integer seedB, UUID advancing, boolean judgeCalled, UUID teamMatchId) {
    }

    /** stage: FINAL, SEMIFINAL, QUARTERFINAL, ROUND_OF_16… for knockout rounds, otherwise null. */
    public record RoundView(int number, RoundStatus status, int byeBigPoints, int byeSmallPoints,
                            String scenario, RoundPhase phase, String stage, TableOrder tableOrder,
                            TimerView timer, List<MatchView> matches,
                            List<TeamRoundService.TeamMatchView> teamMatches) {
    }

    /** remainingSeconds is computed at serverTime; the client counts down from there while running. */
    public record TimerView(int totalSeconds, int remainingSeconds, boolean running, java.time.Instant serverTime) {
    }

    /**
     * position may repeat for players knocked out in the same bracket round (e.g. two 3rd places).
     * knockout: the player reached the bracket; eliminated: knocked out already.
     */
    public record StandingRow(int position, UUID userId, String displayName, int wins, int draws, int losses,
                              int bigPoints, int penaltyPoints, int totalBigPoints, int smallPoints, int played,
                              boolean dropped, boolean knockout, boolean eliminated) {
    }

    public record PenaltyView(UUID id, UUID userId, String displayName, int bigPoints, String reason) {
    }

    public record StandingsView(List<StandingRow> rows, List<PenaltyView> penalties) {
    }

    // ------------------------------------------------------------------

    private final JudgeCallRepository judgeCalls;
    private final TeamRoundService teamRounds;
    private final NotificationService notifications;
    private final RoundRepository rounds;
    private final MatchRepository matches;
    private final ParticipantRepository participants;
    private final PenaltyRepository penalties;
    private final UserRepository users;
    private final ChallengeService challengeService;
    private final TournamentGuard guard;
    private final AuditService audit;
    private final RatingService ratings;
    private final RoundPlanRepository roundPlans;
    private final SecureRandom random = new SecureRandom();

    public RoundService(RoundRepository rounds, MatchRepository matches, ParticipantRepository participants,
                        PenaltyRepository penalties, UserRepository users, ChallengeService challengeService,
                        TournamentGuard guard, AuditService audit, RatingService ratings,
                        RoundPlanRepository roundPlans,
            NotificationService notifications,
            JudgeCallRepository judgeCalls, TeamRoundService teamRounds) {
        this.teamRounds = teamRounds;
        this.judgeCalls = judgeCalls;
        this.notifications = notifications;
        this.rounds = rounds;
        this.matches = matches;
        this.participants = participants;
        this.penalties = penalties;
        this.users = users;
        this.challengeService = challengeService;
        this.guard = guard;
        this.audit = audit;
        this.ratings = ratings;
        this.roundPlans = roundPlans;
    }

    // ------------------------------------------------------------------ organizer: round lifecycle

    @Transactional
    public int generateNextRound(CurrentUser actor, UUID tournamentId) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        List<TournamentRound> existing = rounds.findByTournamentIdOrderByNumberAsc(tournamentId);
        Optional<TournamentRound> last = existing.isEmpty() ? Optional.empty()
                : Optional.of(existing.get(existing.size() - 1));
        if (last.isPresent() && last.get().getStatus() != RoundStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "PREVIOUS_ROUND_NOT_COMPLETED");
        }
        int number = existing.size() + 1;
        if (number == 1) {
            if (t.getStatus() != TournamentStatus.PUBLISHED && t.getStatus() != TournamentStatus.REGISTRATION_CLOSED) {
                throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_READY");
            }
        } else if (t.getStatus() != TournamentStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_IN_PROGRESS");
        }

        List<TournamentParticipant> active = activePlayers(tournamentId);
        TournamentSettings settings = t.settings();
        boolean team = t.isTeamTournament();
        if (number == 1 && team) {
            teamRounds.prepareFirstRound(t, settings);
        } else if (number == 1 && active.size() < 2) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
        }
        if (number == 1 && !team && t.getFormat() != TournamentFormat.SWISS) {
            assignSeeds(active, settings);
        }
        RoundPhase phase = nextPhase(t, settings, existing, tournamentId);
        TournamentRound round = new TournamentRound(tournamentId, number, settings.byeBigPoints(),
                settings.byeSmallPoints(), phase);
        TournamentRoundPlan plan = roundPlans.findByTournamentIdAndNumber(tournamentId, number).orElse(null);
        if (plan != null && plan.getScenarioCode() != null) {
            round.setScenarioCode(plan.getScenarioCode());
        }
        if (plan != null && plan.getDurationMinutes() != null) {
            round.setTimerMinutes(plan.getDurationMinutes());
        }
        try {
            if (team) {
                teamRounds.pair(t, settings, round, existing, number, phase, plan);
            } else switch (phase) {
                case SWISS -> pairSwiss(t, settings, round, existing, active, number, plan);
                case ROUND_ROBIN -> pairRoundRobin(t, round, existing, plan);
                case KNOCKOUT -> pairKnockout(t, settings, round, existing, active);
            }
        } catch (NoValidPairingException e) {
            throw new ApiException(HttpStatus.CONFLICT, "NO_VALID_PAIRING");
        }
        if (number == 1) {
            t.changeStatus(TournamentStatus.IN_PROGRESS);
        }
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "ROUND_PAIRED", "#" + number + " " + phase);
        return number;
    }

    /** Which kind of round comes next, or ALL_ROUNDS_PLAYED. */
    private RoundPhase nextPhase(Tournament t, TournamentSettings settings, List<TournamentRound> existing,
                                 UUID tournamentId) {
        long swiss = existing.stream().filter(r -> r.getPhase() == RoundPhase.SWISS).count();
        long roundRobin = existing.stream().filter(r -> r.getPhase() == RoundPhase.ROUND_ROBIN).count();
        List<TournamentRound> knockout = existing.stream().filter(r -> r.getPhase() == RoundPhase.KNOCKOUT).toList();
        if (!knockout.isEmpty()) {
            TournamentRound lastKo = knockout.get(knockout.size() - 1);
            int size = t.isTeamTournament() ? teamRounds.teamMatchCount(lastKo.getId())
                    : matches.findByRoundIdOrderByTableNumberAsc(lastKo.getId()).size();
            if (size <= 1) {
                throw new ApiException(HttpStatus.CONFLICT, "ALL_ROUNDS_PLAYED");  // the final was played
            }
            return RoundPhase.KNOCKOUT;
        }
        switch (t.getFormat()) {
            case ELIMINATION -> {
                return RoundPhase.KNOCKOUT;
            }
            case ROUND_ROBIN -> {
                int entrants = t.isTeamTournament() ? teamRounds.roundRobinSize(tournamentId)
                        : seededOrder(tournamentId).size();
                int scheduled = RoundRobinSchedule.rounds(entrants);
                if (roundRobin < scheduled) {
                    return RoundPhase.ROUND_ROBIN;
                }
            }
            default -> {
                if (t.getRoundsPlanned() == null || swiss < t.getRoundsPlanned()) {
                    return RoundPhase.SWISS;
                }
            }
        }
        if (settings.topCut() > 0) {
            return RoundPhase.KNOCKOUT;
        }
        throw new ApiException(HttpStatus.CONFLICT, "ALL_ROUNDS_PLAYED");
    }

    private void pairSwiss(Tournament t, TournamentSettings settings, TournamentRound round,
                           List<TournamentRound> existing, List<TournamentParticipant> active, int number,
                           TournamentRoundPlan plan) {
        if (active.size() < 2) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
        }
        UUID tournamentId = t.getId();
        // Round plan (if any) overrides the defaults: round 1 = first-round mode, later rounds = Swiss.
        RoundPairing pairing = plan != null && plan.getPairing() != null ? plan.getPairing()
                : number == 1 ? RoundPairing.of(settings.firstRoundMode()) : RoundPairing.SWISS;
        boolean soft = plan != null && plan.getSoftPreferences() != null ? plan.getSoftPreferences()
                : number == 1 ? settings.softPrefsFirstRound() : true;
        PairingModels.SoftPreferences prefs = soft ? settings.softPreferences() : PairingModels.SoftPreferences.NONE;
        boolean needElo = pairing == RoundPairing.ELO_STRONG_VS_STRONG || pairing == RoundPairing.ELO_TOP_VS_BOTTOM;
        List<Player> players = pairingPlayers(tournamentId, active, existing, settings, needElo);
        SwissPairer pairer = new SwissPairer(random);
        PairingModels.Result result;
        if (number == 1) {
            Set<UUID> activeIds = active.stream().map(TournamentParticipant::getUserId).collect(Collectors.toSet());
            List<Pair> fixed = challengeService.closeForPairing(tournamentId).stream()
                    .filter(c -> activeIds.contains(c.getChallengerId()) && activeIds.contains(c.getChallengedId()))
                    .map(c -> new Pair(c.getChallengerId(), c.getChallengedId()))
                    .toList();
            result = pairer.pairFirstRound(players, pairing.asMode(), fixed, prefs);
        } else if (pairing == RoundPairing.SWISS) {
            int after = t.getRoundsPlanned() == null ? 0 : t.getRoundsPlanned() - number;
            result = pairer.pairRound(players, prefs, after);
        } else {
            result = pairer.pairIgnoringResults(players, pairing.asMode(), prefs);
        }
        // Ranking for table order: standings, or ELO in an ELO-paired first round.
        List<Player> ranking = number == 1 && needElo
                ? players.stream().sorted(Comparator.comparingInt((Player p) -> p.elo() == null ? RatingService.START
                        : p.elo()).reversed()).toList()
                : pairer.standingsOrder(players);
        TableOrder order = plan != null ? plan.getTableOrder() : TableOrder.BY_STANDINGS;
        round.setTableOrder(order);
        rounds.save(round);
        int table = 1;
        for (Pair p : orderTables(result.pairs(), ranking.stream().map(Player::id).toList(), order)) {
            matches.save(new TournamentMatch(round.getId(), tournamentId, table++, p.playerA(), p.playerB()));
        }
        if (result.bye() != null) {
            matches.save(new TournamentMatch(round.getId(), tournamentId, table, result.bye(), null));
        }
    }

    /** Places pairs on tables: random, or by the better-ranked player of each pair (table 1 = best). */
    private List<Pair> orderTables(List<Pair> pairs, List<UUID> ranking, TableOrder order) {
        List<Pair> out = new ArrayList<>(pairs);
        if (order == TableOrder.RANDOM) {
            Collections.shuffle(out, random);
            return out;
        }
        Map<UUID, Integer> rank = new HashMap<>();
        for (int i = 0; i < ranking.size(); i++) {
            rank.put(ranking.get(i), i);
        }
        out.sort(Comparator.comparingInt((Pair p) -> Math.min(rank.getOrDefault(p.playerA(), Integer.MAX_VALUE),
                rank.getOrDefault(p.playerB(), Integer.MAX_VALUE))));
        return out;
    }

    /** Fixed schedule; games of players who dropped out become a BYE for their opponent. */
    private void pairRoundRobin(Tournament t, TournamentRound round, List<TournamentRound> existing,
                                TournamentRoundPlan plan) {
        UUID tournamentId = t.getId();
        List<TournamentParticipant> order = seededOrder(tournamentId);
        int index = (int) existing.stream().filter(r -> r.getPhase() == RoundPhase.ROUND_ROBIN).count();
        List<UUID> ids = order.stream().map(TournamentParticipant::getUserId).toList();
        Set<UUID> droppedIds = order.stream().filter(TournamentParticipant::isDropped)
                .map(TournamentParticipant::getUserId).collect(Collectors.toSet());
        List<Pair> games = new ArrayList<>();
        List<UUID> byes = new ArrayList<>();
        for (Pair p : RoundRobinSchedule.round(ids, index)) {
            boolean aOut = droppedIds.contains(p.playerA());
            boolean bOut = p.playerB() == null || droppedIds.contains(p.playerB());
            if (!aOut && !bOut) {
                games.add(p);
            } else if (!aOut) {
                byes.add(p.playerA());
            } else if (!bOut) {
                byes.add(p.playerB());
            }
        }
        TableOrder tableOrder = plan != null ? plan.getTableOrder() : TableOrder.BY_STANDINGS;
        round.setTableOrder(tableOrder);
        List<UUID> ranking = groupStandings(t, existing).stream().map(r -> r.userId).toList();
        rounds.save(round);
        int table = 1;
        for (Pair p : orderTables(games, ranking, tableOrder)) {
            matches.save(new TournamentMatch(round.getId(), tournamentId, table++, p.playerA(), p.playerB()));
        }
        for (UUID bye : byes) {
            matches.save(new TournamentMatch(round.getId(), tournamentId, table++, bye, null));
        }
    }

    private void pairKnockout(Tournament t, TournamentSettings settings, TournamentRound round,
                              List<TournamentRound> existing, List<TournamentParticipant> active) {
        UUID tournamentId = t.getId();
        List<TournamentRound> koRounds = existing.stream().filter(r -> r.getPhase() == RoundPhase.KNOCKOUT).toList();
        List<KnockoutBracket.Match> bracket;
        if (koRounds.isEmpty()) {
            List<UUID> seeded;
            if (t.getFormat() == TournamentFormat.ELIMINATION) {
                seeded = seededOrder(tournamentId).stream().filter(p -> !p.isDropped())
                        .map(TournamentParticipant::getUserId).toList();
            } else {
                // Top cut: the best N of the Swiss / round-robin standings who are still in the event.
                Set<UUID> activeIds = active.stream().map(TournamentParticipant::getUserId).collect(Collectors.toSet());
                seeded = groupStandings(t, existing).stream().map(r -> r.userId).filter(activeIds::contains)
                        .limit(settings.topCut()).toList();
            }
            if (seeded.size() < 2) {
                throw new ApiException(HttpStatus.CONFLICT, "NOT_ENOUGH_PLAYERS");
            }
            bracket = KnockoutBracket.firstRound(seeded);
        } else {
            TournamentRound previous = koRounds.get(koRounds.size() - 1);
            Set<UUID> droppedIds = participants.findByTournamentIdAndStatusOrderByRegisteredAtAsc(tournamentId,
                    ParticipantStatus.REGISTERED).stream().filter(TournamentParticipant::isDropped)
                    .map(TournamentParticipant::getUserId).collect(Collectors.toSet());
            List<KnockoutBracket.Match> next = KnockoutBracket.nextRound(played(previous, settings));
            // A player who left the event after winning gives the opponent a walkover.
            bracket = next.stream().map(m -> {
                if (m.b() != null && droppedIds.contains(m.a().player()) && !droppedIds.contains(m.b().player())) {
                    return new KnockoutBracket.Match(m.slot(), m.b(), null);
                }
                if (m.b() != null && droppedIds.contains(m.b().player())) {
                    return new KnockoutBracket.Match(m.slot(), m.a(), null);
                }
                return m;
            }).toList();
        }
        rounds.save(round);
        for (KnockoutBracket.Match m : bracket) {
            TournamentMatch match = new TournamentMatch(round.getId(), tournamentId, m.slot() + 1, m.a().player(),
                    m.b() == null ? null : m.b().player());
            match.setSeeds(m.a().seed(), m.b() == null ? null : m.b().seed());
            matches.save(match);
        }
    }

    /** Results of a completed knockout round as bracket input. */
    private List<KnockoutBracket.Played> played(TournamentRound round, TournamentSettings settings) {
        List<KnockoutBracket.Played> out = new ArrayList<>();
        for (TournamentMatch m : matches.findByRoundIdOrderByTableNumberAsc(round.getId())) {
            KnockoutBracket.Seeded a = new KnockoutBracket.Seeded(m.getPlayerA(), seedOr(m.getSeedA()));
            KnockoutBracket.Seeded b = m.isBye() ? null : new KnockoutBracket.Seeded(m.getPlayerB(), seedOr(m.getSeedB()));
            out.add(new KnockoutBracket.Played(m.getTableNumber() - 1, a, b, knockoutWinner(m)));
        }
        return out;
    }

    private static int seedOr(Integer seed) {
        return seed == null ? Integer.MAX_VALUE : seed;
    }

    /** Winner of a confirmed knockout match (equal small points: the higher seed), else null. */
    static UUID knockoutWinner(TournamentMatch m) {
        if (m.getStatus() != MatchStatus.CONFIRMED) {
            return null;
        }
        if (m.isBye()) {
            return m.getPlayerA();
        }
        KnockoutBracket.Seeded a = new KnockoutBracket.Seeded(m.getPlayerA(), seedOr(m.getSeedA()));
        KnockoutBracket.Seeded b = new KnockoutBracket.Seeded(m.getPlayerB(), seedOr(m.getSeedB()));
        int sa = m.getSmallA() == null ? 0 : m.getSmallA();
        int sb = m.getSmallB() == null ? 0 : m.getSmallB();
        return KnockoutBracket.winner(a, b, sa, sb);
    }

    /** Seeds for round robin / elimination: random, or by ELO when the first-round mode uses ELO. */
    private void assignSeeds(List<TournamentParticipant> active, TournamentSettings settings) {
        List<TournamentParticipant> order = new ArrayList<>(active);
        Collections.shuffle(order, random);
        if (settings.firstRoundMode() != PairingModels.FirstRoundMode.RANDOM) {
            Map<UUID, Integer> elo = ratings.current(order.stream().map(TournamentParticipant::getUserId).toList());
            order.sort(Comparator.comparingInt((TournamentParticipant p) ->
                    elo.getOrDefault(p.getUserId(), RatingService.START)).reversed());
        }
        for (int i = 0; i < order.size(); i++) {
            order.get(i).setSeed(i + 1);
        }
    }

    /** Registered players with a seed, in seed order (dropped players included: the schedule stays fixed). */
    private List<TournamentParticipant> seededOrder(UUID tournamentId) {
        return participants.findByTournamentIdAndStatusOrderByRegisteredAtAsc(tournamentId, ParticipantStatus.REGISTERED)
                .stream().filter(p -> p.getSeed() != null)
                .sorted(Comparator.comparingInt(TournamentParticipant::getSeed)).toList();
    }

    /** Standings of the Swiss / round-robin part only (knockout rounds excluded). */
    private List<Standings.Row> groupStandings(Tournament t, List<TournamentRound> allRounds) {
        UUID tournamentId = t.getId();
        List<TournamentParticipant> registered = participants
                .findByTournamentIdAndStatusOrderByRegisteredAtAsc(tournamentId, ParticipantStatus.REGISTERED);
        Set<UUID> groupRounds = allRounds.stream()
                .filter(r -> r.getPhase() != RoundPhase.KNOCKOUT && r.getStatus() != RoundStatus.PAIRED)
                .map(TournamentRound::getId).collect(Collectors.toSet());
        List<TournamentMatch> counted = matches.findByTournamentId(tournamentId).stream()
                .filter(m -> groupRounds.contains(m.getRoundId())).toList();
        return Standings.compute(registered.stream().map(TournamentParticipant::getUserId).toList(), counted,
                allRounds, penalties.findByTournamentIdOrderByCreatedAtAsc(tournamentId), t.settings());
    }

    /** Organizer swaps two players (or a player with the BYE) in a round that has not started yet. */
    @Transactional
    public void swapPlayers(CurrentUser actor, UUID tournamentId, int number, UUID playerX, UUID playerY) {
        Tournament tt = guard.lockManaged(actor, tournamentId);
        TournamentRound round = round(tournamentId, number);
        if (round.getStatus() != RoundStatus.PAIRED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_ALREADY_STARTED");
        }
        if (tt.isTeamTournament()) {
            // Team games follow the captains' line-ups.
            throw new ApiException(HttpStatus.CONFLICT, "TEAM_TOURNAMENT");
        }
        if (round.getPhase() != RoundPhase.SWISS) {
            // Round robin follows a fixed schedule and the bracket follows seeds; re-pair by discarding instead.
            throw new ApiException(HttpStatus.CONFLICT, "SWAP_SWISS_ONLY");
        }
        if (playerX.equals(playerY)) {
            return;
        }
        List<TournamentMatch> list = matches.findByRoundIdOrderByTableNumberAsc(round.getId());
        TournamentMatch mx = list.stream().filter(m -> m.involves(playerX)).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_IN_ROUND"));
        TournamentMatch my = list.stream().filter(m -> m.involves(playerY)).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_IN_ROUND"));
        if (mx == my) {
            return;
        }
        mx.replacePlayer(playerX, playerY);
        my.replacePlayer(playerY, playerX);
        mx.normalizeAfterSwap();
        my.normalizeAfterSwap();
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "PAIRING_SWAPPED",
                "#" + number + ": " + name(playerX) + " <-> " + name(playerY));
    }

    @Transactional
    public void startRound(CurrentUser actor, UUID tournamentId, int number) {
        guard.lockManaged(actor, tournamentId);
        TournamentRound round = round(tournamentId, number);
        if (round.getStatus() != RoundStatus.PAIRED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_ALREADY_STARTED");
        }
        round.start();
        round.startTimerIfPlanned();
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "ROUND_STARTED", "#" + number);
        Tournament t = guard.lock(tournamentId);
        String link = "/tournaments/" + tournamentId;
        for (TournamentMatch m : matches.findByRoundIdOrderByTableNumberAsc(round.getId())) {
            if (m.isBye()) {
                notifications.notify(m.getPlayerA(), NotificationType.ROUND_STARTED,
                        Map.of("tournament", t.getName(), "round", number, "bye", true), link);
                continue;
            }
            notifications.notify(m.getPlayerA(), NotificationType.ROUND_STARTED, Map.of("tournament", t.getName(),
                    "round", number, "table", m.getTableNumber(), "opponent", name(m.getPlayerB()), "bye", false), link);
            notifications.notify(m.getPlayerB(), NotificationType.ROUND_STARTED, Map.of("tournament", t.getName(),
                    "round", number, "table", m.getTableNumber(), "opponent", name(m.getPlayerA()), "bye", false), link);
        }
    }

    /** Throw away a round that has not started (e.g. to re-pair after late changes). */
    @Transactional
    public void discardRound(CurrentUser actor, UUID tournamentId, int number) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        TournamentRound round = round(tournamentId, number);
        if (round.getStatus() != RoundStatus.PAIRED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_ALREADY_STARTED");
        }
        matches.deleteAll(matches.findByRoundIdOrderByTableNumberAsc(round.getId()));
        rounds.delete(round);
        if (number == 1) {
            // Back to before the start; accepted challenges are not restored automatically.
            t.changeStatus(TournamentStatus.REGISTRATION_CLOSED);
        }
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "ROUND_DISCARDED", "#" + number);
    }

    @Transactional
    public void completeRound(CurrentUser actor, UUID tournamentId, int number) {
        guard.lockManaged(actor, tournamentId);
        TournamentRound round = round(tournamentId, number);
        if (round.getStatus() != RoundStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_IN_PROGRESS");
        }
        boolean allConfirmed = matches.findByRoundIdOrderByTableNumberAsc(round.getId()).stream()
                .allMatch(m -> m.getStatus() == MatchStatus.CONFIRMED);
        if (!allConfirmed) {
            throw new ApiException(HttpStatus.CONFLICT, "RESULTS_MISSING");
        }
        round.complete();
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "ROUND_COMPLETED", "#" + number);
    }

    @Transactional
    public void setByePoints(CurrentUser actor, UUID tournamentId, int number, int big, int small) {
        guard.lockManaged(actor, tournamentId);
        round(tournamentId, number).setByePoints(big, small);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "BYE_POINTS_CHANGED", "#" + number + ": " + big + "/" + small);
    }

    @Transactional
    public void finishTournament(CurrentUser actor, UUID tournamentId) {
        Tournament t = guard.lockManaged(actor, tournamentId);
        if (t.getStatus() != TournamentStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "TOURNAMENT_NOT_IN_PROGRESS");
        }
        Optional<TournamentRound> last = rounds.findFirstByTournamentIdOrderByNumberDesc(tournamentId);
        if (last.isEmpty() || last.get().getStatus() != RoundStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "PREVIOUS_ROUND_NOT_COMPLETED");
        }
        t.changeStatus(TournamentStatus.FINISHED);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "STATUS_FINISHED", null);
    }

    // ------------------------------------------------------------------ results

    /** A player enters the score of their own game. Same score from both players confirms it. */
    @Transactional
    public void report(CurrentUser actor, UUID tournamentId, UUID matchId, int smallA, int smallB) {
        guard.lock(tournamentId);
        validateScore(smallA, smallB);
        TournamentMatch m = matchOf(tournamentId, matchId);
        requireRoundInProgress(m);
        if (m.isBye() || !m.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (m.getStatus() == MatchStatus.CONFIRMED) {
            throw new ApiException(HttpStatus.CONFLICT, "RESULT_ALREADY_CONFIRMED");
        }
        boolean opponentReportedSame = m.getStatus() == MatchStatus.REPORTED
                && !actor.id().equals(m.getReportedBy())
                && Integer.valueOf(smallA).equals(m.getSmallA()) && Integer.valueOf(smallB).equals(m.getSmallB());
        if (opponentReportedSame) {
            m.confirm(actor.id());
            return;
        }
        m.report(actor.id(), smallA, smallB);
        Tournament t = guard.visible(actor, tournamentId);
        UUID opponent = m.opponentOf(actor.id());
        // The opponent's own setting decides whether they confirm; by default the entered result is final.
        boolean opponentConfirms = users.findById(opponent).map(User::isConfirmResults).orElse(false);
        if (!opponentConfirms) {
            m.confirm(actor.id());
        }
        notifications.notify(opponent, opponentConfirms ? NotificationType.RESULT_TO_CONFIRM
                : NotificationType.RESULT_RECORDED, Map.of("tournament", t.getName(),
                "opponent", name(actor.id()), "score", m.smallFor(opponent) + ":" + m.smallAgainst(opponent)),
                "/tournaments/" + tournamentId);
    }

    @Transactional
    public void confirm(CurrentUser actor, UUID tournamentId, UUID matchId) {
        guard.lock(tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        requireRoundInProgress(m);
        requireOpponentOfReporter(actor, m);
        m.confirm(actor.id());
    }

    @Transactional
    public void dispute(CurrentUser actor, UUID tournamentId, UUID matchId) {
        guard.lock(tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        requireRoundInProgress(m);
        requireOpponentOfReporter(actor, m);
        m.dispute();
        Tournament t = guard.visible(actor, tournamentId);
        notifications.notify(t.getOwnerId(), NotificationType.RESULT_DISPUTED, Map.of("tournament", t.getName(),
                "table", m.getTableNumber(), "players", name(m.getPlayerA()) + " – " + name(m.getPlayerB())),
                "/tournaments/" + tournamentId + "/manage");
    }

    /** Organizer sets or corrects any result (also in completed rounds); always audited. */
    @Transactional
    public void setResult(CurrentUser actor, UUID tournamentId, UUID matchId, MatchResultType type,
                          Integer smallA, Integer smallB) {
        guard.lockManaged(actor, tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        TournamentRound round = rounds.findById(m.getRoundId()).orElseThrow();
        if (round.getStatus() == RoundStatus.PAIRED) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_STARTED");
        }
        if (m.isBye() || type == MatchResultType.BYE) {
            throw new ApiException(HttpStatus.CONFLICT, "BYE_RESULT_FIXED");
        }
        if (type == MatchResultType.SPLIT && round.getPhase() == RoundPhase.KNOCKOUT && m.getTeamMatchId() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "SPLIT_NOT_IN_KNOCKOUT");
        }
        if (type == MatchResultType.PLAYED) {
            if (smallA == null || smallB == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "SCORE_REQUIRED");
            }
            validateScore(smallA, smallB);
            m.setResult(actor.id(), type, smallA, smallB);
        } else {
            m.setResult(actor.id(), MatchResultType.SPLIT, null, null);
        }
        Tournament tr = guard.visible(actor, tournamentId);
        String score = type == MatchResultType.SPLIT ? "SPLIT" : smallA + ":" + smallB;
        for (UUID p : List.of(m.getPlayerA(), m.getPlayerB())) {
            if (!p.equals(actor.id())) {
                notifications.notify(p, NotificationType.RESULT_SET_BY_ORGANIZER, Map.of("tournament", tr.getName(),
                        "round", round.getNumber(), "score", score), "/tournaments/" + tournamentId);
            }
        }
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "RESULT_SET",
                "#" + round.getNumber() + " " + name(m.getPlayerA()) + " vs " + name(m.getPlayerB()) + ": "
                        + (type == MatchResultType.SPLIT ? "SPLIT" : smallA + ":" + smallB));
    }

    // ------------------------------------------------------------------ penalties

    @Transactional
    public void addPenalty(CurrentUser actor, UUID tournamentId, UUID userId, int bigPoints, String reason) {
        guard.lockManaged(actor, tournamentId);
        if (participants.findByTournamentIdAndUserId(tournamentId, userId).isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PARTICIPANT_NOT_FOUND");
        }
        penalties.save(new TournamentPenalty(tournamentId, userId, bigPoints, reason.trim(), actor.id()));
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "PENALTY_ADDED",
                name(userId) + ": -" + bigPoints + " (" + reason.trim() + ")");
    }

    @Transactional
    public void removePenalty(CurrentUser actor, UUID tournamentId, UUID penaltyId) {
        guard.lockManaged(actor, tournamentId);
        TournamentPenalty p = penalties.findById(penaltyId)
                .filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PENALTY_NOT_FOUND"));
        penalties.delete(p);
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, "PENALTY_REMOVED", name(p.getUserId()) + ": " + p.getReason());
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public List<RoundView> rounds(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        boolean manager = TournamentGuard.canManage(viewer, t);
        TournamentSettings settings = t.settings();
        List<TournamentRound> all = rounds.findByTournamentIdOrderByNumberAsc(tournamentId);
        List<TournamentMatch> allMatches = matches.findByTournamentId(tournamentId);
        Map<UUID, String> names = names(allMatches.stream()
                .flatMap(m -> java.util.stream.Stream.of(m.getPlayerA(), m.getPlayerB()))
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));

        List<RoundView> views = new ArrayList<>();
        Map<UUID, Set<UUID>> playedBefore = new HashMap<>();
        // Only the players of a match and the organizer care whether the judge was called.
        Set<UUID> openCalls = viewer == null ? Set.of() : new HashSet<>();
        if (viewer != null) {
            judgeCalls.findByTournamentIdAndResolvedAtIsNull(tournamentId).forEach(c -> openCalls.add(c.getMatchId()));
        }
        Map<UUID, List<TeamRoundService.TeamMatchView>> teamViews = t.isTeamTournament()
                ? teamRounds.views(t, all, allMatches, viewer, manager, names) : Map.of();
        for (TournamentRound r : all) {
            List<TournamentMatch> roundMatches = allMatches.stream()
                    .filter(m -> m.getRoundId().equals(r.getId()))
                    .sorted(java.util.Comparator.comparingInt(TournamentMatch::getTableNumber)).toList();
            // Unstarted pairings are a draft only the organizer sees.
            // Team events show the team pairings early (captains set line-ups), but the board games stay hidden.
            boolean visible = r.getStatus() != RoundStatus.PAIRED || manager;
            if (visible || t.isTeamTournament()) {
                List<MatchView> mv = !visible ? List.of() : roundMatches.stream()
                        .map(m -> toView(m, r, settings, names, viewer, playedBefore, openCalls)).toList();
                List<TeamRoundService.TeamMatchView> tv = t.isTeamTournament()
                        ? teamViews.getOrDefault(r.getId(), List.of()) : null;
                int bracketSize = tv != null ? tv.size() : roundMatches.size();
                String stage = r.getPhase() == RoundPhase.KNOCKOUT ? KnockoutBracket.stage(bracketSize) : null;
                views.add(new RoundView(r.getNumber(), r.getStatus(), r.getByeBigPoints(), r.getByeSmallPoints(),
                        r.getScenarioCode(), r.getPhase(), stage, r.getTableOrder(), timerOf(r), mv, tv));
            }
            for (TournamentMatch m : roundMatches) {
                if (!m.isBye()) {
                    playedBefore.computeIfAbsent(m.getPlayerA(), k -> new HashSet<>()).add(m.getPlayerB());
                    playedBefore.computeIfAbsent(m.getPlayerB(), k -> new HashSet<>()).add(m.getPlayerA());
                }
            }
        }
        return views;
    }

    @Transactional(readOnly = true)
    public StandingsView standings(CurrentUser viewer, UUID tournamentId) {
        Tournament t = guard.visible(viewer, tournamentId);
        List<TournamentParticipant> registered = participants
                .findByTournamentIdAndStatusOrderByRegisteredAtAsc(tournamentId, ParticipantStatus.REGISTERED);
        Map<UUID, Boolean> dropped = registered.stream()
                .collect(Collectors.toMap(TournamentParticipant::getUserId, TournamentParticipant::isDropped));
        List<TournamentRound> allRounds = rounds.findByTournamentIdOrderByNumberAsc(tournamentId);
        Set<UUID> startedRounds = allRounds.stream().filter(r -> r.getStatus() != RoundStatus.PAIRED)
                .map(TournamentRound::getId).collect(Collectors.toSet());
        List<TournamentMatch> allMatches = matches.findByTournamentId(tournamentId);
        List<TournamentMatch> counted = allMatches.stream()
                .filter(m -> startedRounds.contains(m.getRoundId())).toList();
        List<TournamentPenalty> pens = penalties.findByTournamentIdOrderByCreatedAtAsc(tournamentId);
        // Statistics (W/D/L, points) over every game; the order comes from the group phase plus the bracket.
        Map<UUID, Standings.Row> stats = new HashMap<>();
        for (Standings.Row r : Standings.compute(dropped.keySet(), counted, allRounds, pens, t.settings())) {
            stats.put(r.userId, r);
        }
        List<UUID> groupOrder = groupStandings(t, allRounds).stream().map(r -> r.userId).toList();
        List<Placed> order;
        if (t.isTeamTournament()) {
            // Individual ranking of a team event: every counted game, no bracket (the bracket is between teams).
            order = new ArrayList<>();
            int pos = 1;
            for (Standings.Row r : Standings.compute(dropped.keySet(), counted, allRounds, pens, t.settings())) {
                order.add(new Placed(r.userId, pos++, false, false));
            }
        } else {
            order = placements(allRounds, allMatches, groupOrder);
        }
        Map<UUID, String> names = names(stats.keySet());
        List<StandingRow> out = new ArrayList<>();
        for (Placed p : order) {
            Standings.Row r = stats.get(p.userId());
            if (r == null) {
                continue;
            }
            out.add(new StandingRow(p.position(), r.userId, names.getOrDefault(r.userId, "?"), r.wins, r.draws,
                    r.losses, r.bigPoints, r.penaltyPoints, r.totalBig(), r.smallPoints, r.played,
                    dropped.getOrDefault(r.userId, true), p.knockout(), p.eliminated()));
        }
        List<PenaltyView> pv = pens.stream().map(p -> new PenaltyView(p.getId(), p.getUserId(),
                names.getOrDefault(p.getUserId(), name(p.getUserId())), p.getBigPoints(), p.getReason())).toList();
        return new StandingsView(out, pv);
    }

    private record Placed(UUID userId, int position, boolean knockout, boolean eliminated) {
    }

    /**
     * Final order: players still alive in the bracket (by seed), then knocked-out players by the round they lost
     * in (losers of a round with m matches share place m + 1), then everybody else by group standings.
     */
    static List<Placed> placements(List<TournamentRound> allRounds, List<TournamentMatch> allMatches,
                                   List<UUID> groupOrder) {
        List<TournamentRound> ko = allRounds.stream().filter(r -> r.getPhase() == RoundPhase.KNOCKOUT)
                .filter(r -> r.getStatus() != RoundStatus.PAIRED).toList();
        List<Placed> out = new ArrayList<>();
        Set<UUID> placed = new HashSet<>();
        if (!ko.isEmpty()) {
            Map<UUID, Integer> seed = new HashMap<>();
            Map<UUID, Integer> lostAtPlace = new HashMap<>();
            Set<UUID> inBracket = new HashSet<>();
            for (TournamentRound r : ko) {
                List<TournamentMatch> rm = allMatches.stream().filter(m -> m.getRoundId().equals(r.getId())).toList();
                for (TournamentMatch m : rm) {
                    inBracket.add(m.getPlayerA());
                    if (m.getSeedA() != null) {
                        seed.putIfAbsent(m.getPlayerA(), m.getSeedA());
                    }
                    if (!m.isBye()) {
                        inBracket.add(m.getPlayerB());
                        if (m.getSeedB() != null) {
                            seed.putIfAbsent(m.getPlayerB(), m.getSeedB());
                        }
                        UUID w = knockoutWinner(m);
                        if (w != null) {
                            lostAtPlace.put(m.opponentOf(w), rm.size() + 1);
                        }
                    }
                }
            }
            Comparator<UUID> bySeed = Comparator.comparingInt(id -> seed.getOrDefault(id, Integer.MAX_VALUE));
            List<UUID> alive = inBracket.stream().filter(id -> !lostAtPlace.containsKey(id)).sorted(bySeed).toList();
            int pos = 1;
            for (UUID id : alive) {
                out.add(new Placed(id, pos++, true, false));
            }
            List<UUID> out2 = inBracket.stream().filter(lostAtPlace::containsKey)
                    .sorted(Comparator.comparingInt((UUID id) -> lostAtPlace.get(id)).thenComparing(bySeed)).toList();
            for (UUID id : out2) {
                out.add(new Placed(id, Math.max(lostAtPlace.get(id), alive.size() + 1), true, true));
            }
            placed.addAll(inBracket);
        }
        int pos = placed.size() + 1;
        for (UUID id : groupOrder) {
            if (placed.add(id)) {
                out.add(new Placed(id, pos++, false, false));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ helpers

    private List<TournamentParticipant> activePlayers(UUID tournamentId) {
        return participants.findByTournamentIdAndStatusOrderByRegisteredAtAsc(tournamentId, ParticipantStatus.REGISTERED)
                .stream().filter(p -> !p.isDropped()).toList();
    }

    private List<Player> pairingPlayers(UUID tournamentId, List<TournamentParticipant> active,
                                        List<TournamentRound> existing, TournamentSettings settings,
                                        boolean needElo) {
        List<TournamentMatch> all = matches.findByTournamentId(tournamentId);
        List<TournamentPenalty> pens = penalties.findByTournamentIdOrderByCreatedAtAsc(tournamentId);
        Map<UUID, Standings.Row> stats = new HashMap<>();
        for (Standings.Row r : Standings.compute(
                active.stream().map(TournamentParticipant::getUserId).toList(), all, existing, pens, settings)) {
            stats.put(r.userId, r);
        }
        Map<UUID, Integer> elo = !needElo ? Map.<UUID, Integer>of()
                : ratings.current(active.stream().map(TournamentParticipant::getUserId).toList());
        List<Player> players = new ArrayList<>();
        for (TournamentParticipant p : active) {
            Standings.Row r = stats.get(p.getUserId());
            // Global ELO (all rated games) drives the ELO first-round modes.
            players.add(new Player(p.getUserId(), r.wins, r.totalBig(), r.smallPoints, Set.copyOf(r.opponents),
                    r.hadBye, p.getClub(), p.getFaction(), p.getCity(), elo.get(p.getUserId())));
        }
        return players;
    }

    private static TimerView timerOf(TournamentRound r) {
        if (r.getTimerSeconds() == null) {
            return null;
        }
        java.time.Instant now = java.time.Instant.now();
        return new TimerView(r.getTimerSeconds(), r.remainingSeconds(now), r.isTimerRunning(), now);
    }

    private MatchView toView(TournamentMatch m, TournamentRound r, TournamentSettings s, Map<UUID, String> names,
                             CurrentUser viewer, Map<UUID, Set<UUID>> playedBefore, Set<UUID> openCalls) {
        Integer bigA = null;
        Integer bigB = null;
        if (m.getStatus() == MatchStatus.CONFIRMED && m.getResultType() != null) {
            switch (m.getResultType()) {
                case BYE -> bigA = r.getByeBigPoints();
                case SPLIT -> {
                    bigA = s.splitBigPoints();
                    bigB = s.splitBigPoints();
                }
                case PLAYED -> {
                    bigA = s.bigPointsForGame(m.getSmallA(), m.getSmallB());
                    bigB = s.bigPointsForGame(m.getSmallB(), m.getSmallA());
                }
                default -> { }
            }
        }
        Integer smallA = m.getResultType() == MatchResultType.BYE ? Integer.valueOf(r.getByeSmallPoints())
                : m.getResultType() == MatchResultType.SPLIT ? Integer.valueOf(s.splitSmallPoints()) : m.getSmallA();
        Integer smallB = m.getResultType() == MatchResultType.SPLIT ? Integer.valueOf(s.splitSmallPoints()) : m.getSmallB();
        boolean rematch = !m.isBye() && playedBefore.getOrDefault(m.getPlayerA(), Set.of()).contains(m.getPlayerB());
        boolean inProgress = r.getStatus() == RoundStatus.IN_PROGRESS;
        boolean mine = viewer != null && !m.isBye() && m.involves(viewer.id());
        boolean canReport = inProgress && mine && m.getStatus() != MatchStatus.CONFIRMED;
        boolean canConfirm = inProgress && mine && m.getStatus() == MatchStatus.REPORTED
                && !viewer.id().equals(m.getReportedBy());
        return new MatchView(m.getId(), m.getTableNumber(),
                new PlayerRef(m.getPlayerA(), names.getOrDefault(m.getPlayerA(), "?")),
                m.getPlayerB() == null ? null : new PlayerRef(m.getPlayerB(), names.getOrDefault(m.getPlayerB(), "?")),
                m.getStatus(), m.getResultType(), smallA, smallB, bigA, bigB, m.getReportedBy(), rematch,
                canReport, canConfirm, m.getSeedA(), m.getSeedB(),
                r.getPhase() == RoundPhase.KNOCKOUT && m.getTeamMatchId() == null ? knockoutWinner(m) : null,
                openCalls.contains(m.getId()), m.getTeamMatchId());
    }

    private TournamentRound round(UUID tournamentId, int number) {
        return rounds.findByTournamentIdAndNumber(tournamentId, number)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ROUND_NOT_FOUND"));
    }

    private TournamentMatch matchOf(UUID tournamentId, UUID matchId) {
        return matches.findById(matchId)
                .filter(m -> m.getTournamentId().equals(tournamentId))  // no cross-tournament access (IDOR)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MATCH_NOT_FOUND"));
    }

    private void requireRoundInProgress(TournamentMatch m) {
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        if (r.getStatus() != RoundStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "ROUND_NOT_IN_PROGRESS");
        }
    }

    private static void requireOpponentOfReporter(CurrentUser actor, TournamentMatch m) {
        if (m.isBye() || !m.involves(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        if (m.getStatus() != MatchStatus.REPORTED || actor.id().equals(m.getReportedBy())) {
            throw new ApiException(HttpStatus.CONFLICT, "NOTHING_TO_CONFIRM");
        }
    }

    private static void validateScore(int a, int b) {
        if (a < 0 || b < 0 || a > MAX_SMALL_POINTS || b > MAX_SMALL_POINTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE");
        }
    }

    private Map<UUID, String> names(Collection<UUID> ids) {
        return users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a, HashMap::new));
    }

    private String name(UUID id) {
        return id == null ? "BYE" : users.findById(id).map(User::getDisplayName).orElse("?");
    }

}
