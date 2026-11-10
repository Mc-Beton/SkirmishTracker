package com.skirmishchronicle.boltaction;

import java.util.List;
import java.util.Set;

/**
 * Bolt Action (Third Edition) reference data used by WarBracket: nations a list can be written for and the
 * victory conditions of the core scenario generator (names are game terms, not rulebook text).
 */
public final class BoltAction {

    /** Nations with an "Armies of…" book or an official PDF army list, plus OTHER for anything else. */
    public static final List<String> NATIONS = List.of(
            "GERMANY", "UNITED_STATES", "GREAT_BRITAIN", "BRITISH_COMMONWEALTH", "SOVIET_UNION", "IMPERIAL_JAPAN",
            "ITALY", "FRANCE", "POLAND", "FINLAND", "HUNGARY", "ROMANIA", "BULGARIA", "GREECE", "NORWAY",
            "BELGIUM", "NETHERLANDS", "PARTISANS", "OTHER");

    /** Victory conditions of the Third Edition scenario generator. */
    public static final List<String> SCENARIOS = List.of(
            "BA_SEEK_AND_DESTROY", "BA_KEY_POSITIONS", "BA_BREAKTHROUGH", "BA_TOP_SECRET", "BA_DEMOLITION",
            "BA_HOLD_UNTIL_RELIEVED");

    private static final Set<String> NATION_SET = Set.copyOf(NATIONS);
    private static final Set<String> SCENARIO_SET = Set.copyOf(SCENARIOS);

    private BoltAction() {
    }

    public static boolean isNation(String code) {
        return code != null && NATION_SET.contains(code);
    }

    public static boolean isScenario(String code) {
        return code != null && SCENARIO_SET.contains(code);
    }
}
