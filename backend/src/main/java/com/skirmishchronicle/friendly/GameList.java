package com.skirmishchronicle.friendly;

import java.util.List;

/** A warband list attached to an own game (lighter than a tournament list: no limit, leader optional). */
public record GameList(String faction, String alliedFaction, List<Unit> units, int totalPoints) {

    public record Unit(String unit, boolean leader, List<Item> items) {
    }

    public record Item(String item, boolean reduced) {
    }
}
