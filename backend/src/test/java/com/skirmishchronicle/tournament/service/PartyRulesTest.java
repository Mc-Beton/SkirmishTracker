package com.skirmishchronicle.tournament.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.tournament.service.WarbandService.ItemInput;
import com.skirmishchronicle.tournament.service.WarbandService.StoredUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PartyRulesTest {

    private static final Map<String, Integer> UNITS = Map.of("PALADIN", 40, "GUARD", 18, "RUNNER", 20, "HIEROPHANT", 30);
    private static final Map<String, Integer> ITEMS = Map.of("POUCH", 1, "CROSSBOW", 5);

    // A 125-point roster: two Guards (duplicates are separate entries), items on the Paladin.
    private static final List<StoredUnit> ROSTER = List.of(
            new StoredUnit("PALADIN", 0, null, false, List.of(new ItemInput("CROSSBOW", false), new ItemInput("POUCH", false))),
            new StoredUnit("GUARD", 0, null, false, List.of()),
            new StoredUnit("GUARD", 2, null, false, List.of()),
            new StoredUnit("RUNNER", 0, null, false, List.of(new ItemInput("POUCH", false))),
            new StoredUnit("HIEROPHANT", 0, null, false, List.of()));

    private static PartyRules.Party pick(List<PartyRules.Pick> picks, int leader, int limit) {
        return PartyRules.validate(ROSTER, picks, leader, 7, limit, UNITS::get, i -> ITEMS.get(i.item()));
    }

    private static String code(Runnable r) {
        return assertThrows(ApiException.class, r::run).getCode();
    }

    @Test
    void partyTakesEntriesAndSomeOfTheirUpgradesFromTheRoster() {
        PartyRules.Party p = pick(List.of(new PartyRules.Pick(0, List.of(1)), new PartyRules.Pick(1, List.of()),
                new PartyRules.Pick(2, List.of())), 0, 85);
        assertEquals(40 + 1 + 18 + 18 + 2, p.total());          // crossbow left at home, extra points kept
        assertTrue(p.units().get(0).leader());
        assertEquals("POUCH", p.units().get(0).items().get(0).item());
        assertEquals(List.of(1), p.units().get(0).itemIndexes());
    }

    @Test
    void everythingMustComeFromTheRosterAndFitTheLimit() {
        assertEquals("PARTY_NOT_FROM_ROSTER", code(() -> pick(List.of(new PartyRules.Pick(9, List.of())), 9, 85)));
        assertEquals("PARTY_NOT_FROM_ROSTER", code(() -> pick(List.of(new PartyRules.Pick(1, List.of()),
                new PartyRules.Pick(1, List.of())), 1, 85)));                         // same entry twice
        assertEquals("PARTY_NOT_FROM_ROSTER", code(() -> pick(List.of(new PartyRules.Pick(1, List.of(0))), 1, 85)));
        assertEquals("PARTY_LEADER_REQUIRED", code(() -> pick(List.of(new PartyRules.Pick(1, List.of())), 3, 85)));
        assertEquals("PARTY_OVER_LIMIT", code(() -> pick(List.of(new PartyRules.Pick(0, List.of(0, 1)),
                new PartyRules.Pick(4, List.of()), new PartyRules.Pick(3, List.of())), 0, 85)));
        assertEquals("PARTY_EMPTY", code(() -> pick(List.of(), 0, 85)));
        assertEquals("INVALID_LEADER_INT", code(() -> PartyRules.validate(ROSTER, List.of(new PartyRules.Pick(1, List.of())),
                1, 0, 85, UNITS::get, i -> ITEMS.get(i.item()))));
    }
}
