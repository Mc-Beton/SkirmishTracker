package com.skirmishchronicle.tournament.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.tournament.service.WarbandService.ItemInput;
import com.skirmishchronicle.tournament.service.WarbandService.StoredUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.ToIntFunction;
import org.springframework.http.HttpStatus;

/**
 * Picking a party from a roster (framework-free): every entry comes from the roster (each roster entry at most
 * once), upgrades only those the roster entry carries, exactly one leader among the picked entries, and the
 * total within the party limit.
 */
public final class PartyRules {

    /** One picked roster entry: its index and the indexes of the upgrades kept. */
    public record Pick(int slot, List<Integer> items) {
    }

    /** A validated party entry, stored as JSON (same unit/items shape as a warband, plus the references). */
    public record PartyUnit(int slot, String unit, int extraPoints, boolean leader, List<ItemInput> items,
                            List<Integer> itemIndexes) {
    }

    public record Party(List<PartyUnit> units, int total) {
    }

    private PartyRules() {
    }

    /**
     * @param unitPoints cost of a character by code; {@code itemPoints} cost of an item (respecting reduced)
     */
    public static Party validate(List<StoredUnit> roster, List<Pick> picks, int leaderSlot, int leaderInt, int limit,
                                 ToIntFunction<String> unitPoints, ToIntFunction<ItemInput> itemPoints) {
        if (picks == null || picks.isEmpty()) {
            throw bad("PARTY_EMPTY");
        }
        if (leaderInt < 1 || leaderInt > 30) {
            throw bad("INVALID_LEADER_INT");
        }
        Set<Integer> used = new HashSet<>();
        List<PartyUnit> out = new ArrayList<>();
        int total = 0;
        boolean leaderPicked = false;
        for (Pick p : picks) {
            if (p == null || p.slot() < 0 || p.slot() >= roster.size() || !used.add(p.slot())) {
                throw bad("PARTY_NOT_FROM_ROSTER");
            }
            StoredUnit r = roster.get(p.slot());
            List<ItemInput> rosterItems = r.items() == null ? List.of() : r.items();
            Set<Integer> itemIdx = new HashSet<>();
            List<ItemInput> items = new ArrayList<>();
            List<Integer> indexes = new ArrayList<>();
            for (Integer i : p.items() == null ? List.<Integer>of() : p.items()) {
                if (i == null || i < 0 || i >= rosterItems.size() || !itemIdx.add(i)) {
                    throw bad("PARTY_NOT_FROM_ROSTER");
                }
                items.add(rosterItems.get(i));
                indexes.add(i);
                total += itemPoints.applyAsInt(rosterItems.get(i));
            }
            total += unitPoints.applyAsInt(r.unit()) + r.extraPoints();
            boolean leader = p.slot() == leaderSlot;
            leaderPicked |= leader;
            out.add(new PartyUnit(p.slot(), r.unit(), r.extraPoints(), leader, items, indexes));
        }
        if (!leaderPicked) {
            throw bad("PARTY_LEADER_REQUIRED");
        }
        if (total > limit) {
            throw bad("PARTY_OVER_LIMIT");
        }
        return new Party(out, total);
    }

    private static ApiException bad(String code) {
        return new ApiException(HttpStatus.BAD_REQUEST, code);
    }
}
