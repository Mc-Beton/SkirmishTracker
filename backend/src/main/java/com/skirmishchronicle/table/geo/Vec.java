package com.skirmishchronicle.table.geo;

/** A point or vector on the table plan (inches). */
public record Vec(double x, double y) {

    public static Vec fromAngle(double deg) {
        double r = Math.toRadians(deg);
        return new Vec(Math.cos(r), Math.sin(r));
    }

    public Vec plus(Vec o) {
        return new Vec(x + o.x, y + o.y);
    }

    public Vec minus(Vec o) {
        return new Vec(x - o.x, y - o.y);
    }

    public Vec times(double k) {
        return new Vec(x * k, y * k);
    }

    public double dot(Vec o) {
        return x * o.x + y * o.y;
    }

    public double cross(Vec o) {
        return x * o.y - y * o.x;
    }

    public double dist(Vec o) {
        return Math.hypot(x - o.x, y - o.y);
    }

    public Vec lerp(Vec o, double t) {
        return new Vec(x + (o.x - x) * t, y + (o.y - y) * t);
    }

    /** Rotates around the origin by {@code deg} (clockwise on screen, because y points down). */
    public Vec rotate(double deg) {
        double r = Math.toRadians(deg), c = Math.cos(r), s = Math.sin(r);
        return new Vec(x * c - y * s, x * s + y * c);
    }
}
