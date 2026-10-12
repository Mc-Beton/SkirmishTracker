package com.skirmishchronicle.armylist;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.tournament.domain.ListFormat;
import com.skirmishchronicle.tournament.service.WarbandService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "My lists": a player's saved lists. Same rules as tournament lists (WarbandService.validateList) without a
 * points limit – the limit belongs to the tournament the list is later copied into.
 */
@Service
public class ArmyListService {

    public static final int MAX_LISTS = 100;
    public static final int MAX_NAME = 80;
    private static final String AUDIT_TYPE = "ARMY_LIST";

    public record Input(String name, ListFormat format, WarbandService.SaveInput list) {
    }

    /** {@code totalPoints} uses today's costs; {@code pointsChanged} = differs from the total when saved. */
    public record Summary(UUID id, int number, String name, ListFormat format, String faction, String alliedFaction,
                          int totalPoints, boolean pointsChanged, int units, Instant updatedAt) {
    }

    public record View(UUID id, int number, String name, ListFormat format, String faction, String alliedFaction,
                       int leaderInt, int totalPoints, boolean pointsChanged, List<WarbandService.UnitView> units,
                       Instant updatedAt) {
    }

    private final ArmyListRepository lists;
    private final WarbandService warbands;
    private final UserRepository users;
    private final AuditService audit;

    public ArmyListService(ArmyListRepository lists, WarbandService warbands, UserRepository users,
                           AuditService audit) {
        this.lists = lists;
        this.warbands = warbands;
        this.users = users;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Summary> mine(CurrentUser actor) {
        return lists.findByUserIdOrderByNumberAsc(actor.id()).stream().map(l -> {
            List<WarbandService.UnitView> units = warbands.unitViews(l.getFaction(), l.getAlliedFaction(), l.getUnits());
            int now = total(units);
            return new Summary(l.getId(), l.getNumber(), l.getName(), l.getFormat(), l.getFaction(),
                    l.getAlliedFaction(), now, now != l.getTotalPoints(), units.size(), l.getUpdatedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public View get(CurrentUser actor, UUID id) {
        return view(own(actor, id));
    }

    @Transactional
    public View create(CurrentUser actor, Input input) {
        // One writer per user at a time, so two quick saves cannot take the same number.
        users.findByIdForUpdate(actor.id());
        if (lists.countByUserId(actor.id()) >= MAX_LISTS) {
            throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_LISTS");
        }
        ArmyList l = new ArmyList(actor.id(), lists.maxNumber(actor.id()) + 1);
        apply(l, input);
        lists.save(l);
        audit.record(actor.id(), AUDIT_TYPE, l.getId(), "CREATED", "#" + l.getNumber());
        return view(l);
    }

    @Transactional
    public View update(CurrentUser actor, UUID id, Input input) {
        ArmyList l = own(actor, id);
        apply(l, input);
        return view(l);
    }

    /** A copy under the next number; {@code format} ROSTER turns a classic list into a roster (no leader). */
    @Transactional
    public View duplicate(CurrentUser actor, UUID id, ListFormat format) {
        ArmyList src = own(actor, id);
        ListFormat target = format == null ? src.getFormat() : format;
        if (src.getFormat() == ListFormat.ROSTER && target == ListFormat.CLASSIC) {
            // A roster has no leader to keep; the player picks one in the editor of the copy instead.
            throw new ApiException(HttpStatus.BAD_REQUEST, "WARBAND_LEADER_REQUIRED");
        }
        boolean roster = target == ListFormat.ROSTER;
        List<WarbandService.UnitInput> units = warbands.unitViews(src.getFaction(), src.getAlliedFaction(),
                src.getUnits()).stream().map(u -> new WarbandService.UnitInput(u.unit(), u.extraPoints(), u.notes(),
                        !roster && u.leader(), u.items().stream()
                                .map(i -> new WarbandService.ItemInput(i.item(), i.reduced())).toList()))
                .toList();
        String name = src.getName() == null ? null : truncate(src.getName() + " (2)");
        return create(actor, new Input(name, target, new WarbandService.SaveInput(src.getFaction(),
                src.getAlliedFaction(), roster ? 0 : src.getLeaderInt(), units)));
    }

    @Transactional
    public void delete(CurrentUser actor, UUID id) {
        ArmyList l = own(actor, id);
        // Tournament lists copied from it keep their content; only the "copied from" mark is cleared (FK).
        lists.delete(l);
        audit.record(actor.id(), AUDIT_TYPE, l.getId(), "DELETED", "#" + l.getNumber());
    }

    // ------------------------------------------------------------------ helpers

    private void apply(ArmyList l, Input input) {
        ListFormat format = input.format() == null ? ListFormat.CLASSIC : input.format();
        boolean roster = format == ListFormat.ROSTER;
        WarbandService.Validated v = warbands.validateList(input.list(), roster, null);
        String name = input.name() == null || input.name().isBlank() ? null : input.name().strip();
        if (name != null && name.length() > MAX_NAME) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LIST_NAME");
        }
        l.update(name, format, v.faction(), v.allied(), roster ? 0 : input.list().leaderInt(), v.total(),
                warbands.write(v.units()));
    }

    private ArmyList own(CurrentUser actor, UUID id) {
        return lists.findById(id).filter(l -> l.getUserId().equals(actor.id()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ARMY_LIST_NOT_FOUND"));
    }

    private View view(ArmyList l) {
        List<WarbandService.UnitView> units = warbands.unitViews(l.getFaction(), l.getAlliedFaction(), l.getUnits());
        int now = total(units);
        return new View(l.getId(), l.getNumber(), l.getName(), l.getFormat(), l.getFaction(), l.getAlliedFaction(),
                l.getLeaderInt(), now, now != l.getTotalPoints(), units, l.getUpdatedAt());
    }

    private static int total(List<WarbandService.UnitView> units) {
        return units.stream().mapToInt(WarbandService.UnitView::totalPoints).sum();
    }

    private static String truncate(String s) {
        return s.length() <= MAX_NAME ? s : s.substring(0, MAX_NAME);
    }
}
