package com.skirmishchronicle.table.geo;

import java.util.Set;

/**
 * A model as the geometry sees it. {@code spd} and {@code ag} are effective values (State modifiers applied).
 * {@code side} is 0 for player A and 1 for player B.
 */
public record Piece(String id, int side, Vec pos, double facing, Size size, double spd, int ag, String faction,
                    Set<String> keywords, Set<String> states) {

    public Piece {
        keywords = Set.copyOf(keywords);
        states = Set.copyOf(states);
    }

    public boolean has(String keyword) {
        return keywords.contains(keyword);
    }

    public boolean in(String state) {
        return states.contains(state);
    }
}
