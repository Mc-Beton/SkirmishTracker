package com.skirmishchronicle.tournament.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.content.ArmyContent;
import com.skirmishchronicle.content.ContentService;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.live.LiveEventService;
import com.skirmishchronicle.tournament.domain.MatchParty;
import com.skirmishchronicle.tournament.domain.MatchStatus;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentMatch;
import com.skirmishchronicle.tournament.domain.TournamentRound;
import com.skirmishchronicle.tournament.domain.Warband;
import com.skirmishchronicle.tournament.repo.MatchPartyRepository;
import com.skirmishchronicle.tournament.repo.MatchRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.repo.SchemeDrawRepository;
import com.skirmishchronicle.tournament.repo.WarbandRepository;
import com.skirmishchronicle.tournament.service.WarbandService.ItemInput;
import com.skirmishchronicle.tournament.service.WarbandService.StoredUnit;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Roster format (Eldfall competitive Season 2): before each game, once the quest and the opponent's faction are
 * known, a player picks a party from their roster. The party is hidden information – the opponent sees only
 * whether it has been chosen – until the game is over (result confirmed or round completed).
 */
@Service
public class PartyService {

    private static final String AUDIT_TYPE = "TOURNAMENT";
    private static final TypeReference<List<PartyRules.PartyUnit>> STORED = new TypeReference<>() {
    };

    public record RosterItem(int index, String item, String name, int points, boolean reduced) {
    }

    public record RosterEntry(int slot, String unit, String name, int points, int extraPoints, List<RosterItem> items) {
    }

    public record PartyEntry(int slot, String unit, String name, boolean leader, List<Integer> items) {
    }

    public record PartyChoice(List<PartyEntry> units, int leaderInt, int totalPoints, Instant updatedAt) {
    }

    /**
     * One player of the game. {@code roster} null = hidden from the viewer; {@code party} null = not chosen yet
     * or hidden (then {@code chosen} still says whether it exists).
     */
    public record Side(UUID userId, String displayName, String faction, String alliedFaction, Integer rosterPoints,
                       List<RosterEntry> roster, boolean chosen, PartyChoice party, boolean canEdit) {
    }

    public record PartyView(boolean rosterFormat, Integer rosterLimit, Integer partyLimit, String scenario,
                            boolean revealed, List<Side> sides) {
    }

    public record SaveInput(List<PartyRules.Pick> units, int leaderSlot, int leaderInt) {
    }

    private final TournamentGuard guard;
    private final MatchRepository matches;
    private final RoundRepository rounds;
    private final WarbandRepository warbands;
    private final WarbandService warbandService;
    private final MatchPartyRepository parties;
    private final SchemeDrawRepository draws;
    private final ContentService content;
    private final UserRepository users;
    private final AuditService audit;
    private final LiveEventService live;
    private final ObjectMapper mapper;

    public PartyService(TournamentGuard guard, MatchRepository matches, RoundRepository rounds,
                        WarbandRepository warbands, WarbandService warbandService, MatchPartyRepository parties,
                        SchemeDrawRepository draws, ContentService content, UserRepository users, AuditService audit,
                        LiveEventService live, ObjectMapper mapper) {
        this.guard = guard;
        this.matches = matches;
        this.rounds = rounds;
        this.warbands = warbands;
        this.warbandService = warbandService;
        this.parties = parties;
        this.draws = draws;
        this.content = content;
        this.users = users;
        this.audit = audit;
        this.live = live;
        this.mapper = mapper;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public PartyView view(CurrentUser viewer, UUID tournamentId, UUID matchId) {
        Tournament t = guard.visible(viewer, tournamentId);
        TournamentMatch m = matchOf(tournamentId, matchId);
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        boolean manager = TournamentGuard.canManage(viewer, t);
        boolean revealed = revealed(m, r);
        List<Side> sides = new ArrayList<>();
        for (UUID player : m.isBye() ? List.of(m.getPlayerA()) : List.of(m.getPlayerA(), m.getPlayerB())) {
            boolean own = viewer != null && viewer.id().equals(player);
            Warband w = warbands.findByTournamentIdAndUserId(tournamentId, player).orElse(null);
            MatchParty p = parties.findByMatchIdAndUserId(matchId, player).orElse(null);
            boolean rosterVisible = own || manager || !t.isHiddenRosters() || revealed;
            boolean partyVisible = own || manager || revealed;
            sides.add(new Side(player, name(player), w == null ? null : w.getFaction(),
                    w == null ? null : w.getAlliedFaction(),
                    w == null || !rosterVisible ? null : w.getTotalPoints(),
                    w == null || !rosterVisible ? null : roster(w), p != null,
                    p == null || !partyVisible ? null : choice(p),
                    t.isRoster() && canEdit(viewer, manager, m, r, player)));
        }
        return new PartyView(t.isRoster(), t.getPointsLimit(), t.getPartyLimit(), r.getScenarioCode(), revealed,
                sides);
    }

    /** Leader INT of the party a player chose for the game (roster format), for the scheme draw. */
    @Transactional(readOnly = true)
    public Optional<MatchParty> find(UUID matchId, UUID userId) {
        return parties.findByMatchIdAndUserId(matchId, userId);
    }

    // ------------------------------------------------------------------ write

    @Transactional
    public PartyView save(CurrentUser actor, UUID tournamentId, UUID matchId, UUID forUser, SaveInput input) {
        Tournament t = guard.lock(tournamentId);
        if (!t.isRoster()) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_A_ROSTER_TOURNAMENT");
        }
        TournamentMatch m = matchOf(tournamentId, matchId);
        TournamentRound r = rounds.findById(m.getRoundId()).orElseThrow();
        boolean manager = TournamentGuard.canManage(actor, t);
        UUID player = forUser == null ? actor.id() : forUser;
        if (!m.involves(player) || m.isBye()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PLAYER_NOT_IN_MATCH");
        }
        if (!canEdit(actor, manager, m, r, player)) {
            throw new ApiException(HttpStatus.CONFLICT, "PARTY_LOCKED");
        }
        Warband w = warbands.findByTournamentIdAndUserId(tournamentId, player)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "ROSTER_MISSING"));
        List<StoredUnit> roster = warbandService.units(w);
        PartyRules.Party party = PartyRules.validate(roster, input.units(), input.leaderSlot(), input.leaderInt(),
                t.getPartyLimit() == null ? Integer.MAX_VALUE : t.getPartyLimit(),
                code -> content.unit(code).map(ArmyContent.Unit::points).orElse(0),
                this::itemPoints);
        MatchParty p = parties.findByMatchIdAndUserId(matchId, player).orElseGet(() -> new MatchParty(matchId, player));
        p.update(write(party.units()), input.leaderInt(), party.total());
        parties.save(p);
        // Only the fact and the size go to the log – the party itself stays hidden until the game is over.
        audit.record(actor.id(), AUDIT_TYPE, tournamentId, actor.id().equals(player) ? "PARTY_SAVED"
                : "PARTY_SET_BY_ORGANIZER", name(player) + ", " + party.total() + " pts");
        live.tournamentChangedAfterCommit(tournamentId, "party");
        return view(actor, tournamentId, matchId);
    }

    // ------------------------------------------------------------------ rules

    /** The game is over for hidden-information purposes: result confirmed or round completed. */
    private static boolean revealed(TournamentMatch m, TournamentRound r) {
        return m.getStatus() == MatchStatus.CONFIRMED || r.getStatus() == RoundStatus.COMPLETED;
    }

    /**
     * The player: from pairing until a result is reported or they drew their schemes (the draw uses the leader).
     * The organizer: until the result is confirmed.
     */
    private boolean canEdit(CurrentUser viewer, boolean manager, TournamentMatch m, TournamentRound r, UUID player) {
        if (viewer == null || m.isBye() || r.getStatus() == RoundStatus.COMPLETED || m.getStatus() == MatchStatus.CONFIRMED) {
            return false;
        }
        if (manager) {
            return true;
        }
        return viewer.id().equals(player) && m.getStatus() == MatchStatus.PENDING
                && draws.findByMatchIdAndUserId(m.getId(), player).isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private int itemPoints(ItemInput i) {
        return content.item(i.item())
                .map(it -> i.reduced() && it.reducedPoints() != null ? it.reducedPoints() : it.points()).orElse(0);
    }

    private List<RosterEntry> roster(Warband w) {
        List<StoredUnit> units = warbandService.units(w);
        List<RosterEntry> out = new ArrayList<>();
        for (int i = 0; i < units.size(); i++) {
            StoredUnit u = units.get(i);
            List<ItemInput> items = u.items() == null ? List.of() : u.items();
            List<RosterItem> ri = new ArrayList<>();
            for (int j = 0; j < items.size(); j++) {
                ItemInput it = items.get(j);
                ri.add(new RosterItem(j, it.item(), content.item(it.item()).map(ArmyContent.Item::name).orElse(it.item()),
                        itemPoints(it), it.reduced()));
            }
            out.add(new RosterEntry(i, u.unit(), content.unit(u.unit()).map(ArmyContent.Unit::name).orElse(u.unit()),
                    content.unit(u.unit()).map(ArmyContent.Unit::points).orElse(0), u.extraPoints(), ri));
        }
        return out;
    }

    private PartyChoice choice(MatchParty p) {
        List<PartyEntry> entries = read(p.getUnits()).stream()
                .map(u -> new PartyEntry(u.slot(), u.unit(),
                        content.unit(u.unit()).map(ArmyContent.Unit::name).orElse(u.unit()), u.leader(),
                        u.itemIndexes() == null ? List.of() : u.itemIndexes()))
                .toList();
        return new PartyChoice(entries, p.getLeaderInt(), p.getTotalPoints(), p.getUpdatedAt());
    }

    private String write(List<PartyRules.PartyUnit> units) {
        try {
            return mapper.writeValueAsString(units);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private List<PartyRules.PartyUnit> read(String json) {
        try {
            return mapper.readValue(json, STORED);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private TournamentMatch matchOf(UUID tournamentId, UUID matchId) {
        return matches.findById(matchId).filter(x -> x.getTournamentId().equals(tournamentId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MATCH_NOT_FOUND"));
    }

    private String name(UUID id) {
        return users.findById(id).map(User::getDisplayName).orElse("?");
    }
}
