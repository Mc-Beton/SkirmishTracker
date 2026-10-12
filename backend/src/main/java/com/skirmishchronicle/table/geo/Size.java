package com.skirmishchronicle.table.geo;

/** Model Size with its Hitbox: base diameter x height in mm (rulebook p.9; errata: Epic 85+ mm, we use 100). */
public enum Size {
    SMALL(25, 25), MEDIUM(32, 45), LARGE(40, 45), HUGE(50, 50), GIGANTIC(60, 60), COLOSSAL(80, 80), EPIC(100, 100);

    public final int baseMm;
    public final int heightMm;

    Size(int baseMm, int heightMm) {
        this.baseMm = baseMm;
        this.heightMm = heightMm;
    }
}
