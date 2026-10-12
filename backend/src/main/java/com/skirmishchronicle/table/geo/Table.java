package com.skirmishchronicle.table.geo;

import java.util.List;

/** The field: size in inches, world terrain and models. */
public record Table(double width, double height, List<Terrain> terrain, List<Piece> pieces) {

    public Table {
        terrain = List.copyOf(terrain);
        pieces = List.copyOf(pieces);
    }

    public Piece piece(String id) {
        return pieces.stream().filter(p -> p.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unknown piece " + id));
    }
}
