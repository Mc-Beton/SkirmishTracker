package com.skirmishchronicle.table.geo;

/** Cylinder: radius and height in inches. A Crouched or Dead model's hitbox is its base (~4 mm high). */
public record Hitbox(double r, double h) {

    public static final double MM = 1 / 25.4;
    public static final double BASE_THICKNESS_IN = 4 * MM;

    public static Hitbox of(Size size, boolean flat) {
        return new Hitbox(size.baseMm * MM / 2, flat ? BASE_THICKNESS_IN : size.heightMm * MM);
    }
}
