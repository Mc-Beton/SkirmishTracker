package com.skirmishchronicle.content;

import java.util.List;
import java.util.Map;

/**
 * Army lists and upgrade/item costs imported from content/units.xlsx and content/items.xlsx
 * (tools/import_units.py). {@code itemLists} has a NEUTRAL key (every faction) plus faction codes
 * (only warbands of that faction).
 */
public record ArmyContent(String source, List<ArmyFaction> factions, List<Unit> units, Map<String, List<String>> lists,
                          List<Item> items, Map<String, List<String>> itemLists) {

    public static final String NEUTRAL = "NEUTRAL";

    public record ArmyFaction(String code, String name, boolean playable, List<String> alwaysAvailable,
                              List<String> optionalAllies) {
    }

    public record Unit(String code, String name, int points) {
    }

    /** {@code reducedPoints}/{@code reducedNote}: optional cheaper cost when the note's condition holds. */
    public record Item(String code, String name, int points, Integer reducedPoints, GameContent.Localized reducedNote) {
    }
}
