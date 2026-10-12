package com.skirmishchronicle.table.rules;

import java.util.EnumMap;
import java.util.Map;

/**
 * States (rulebook p.59–62, errata APR 2026). {@code halves}/{@code doubles} list the attributes the State
 * halves or doubles; the table applies them automatically. Other effects (rolls in the Strategic Phase,
 * allowed Actions) are reminders for the players – the app shows them, it does not resolve them.
 */
public enum ModelState {
    BLEEDING(Map.of(), Map.of()),
    BLINDED(Map.of(), Map.of()),
    CONFUSED(once(Stat.OFF, Stat.DEF, Stat.ACC, Stat.INT, Stat.AG, Stat.M), Map.of()),
    CRIPPLED(once(Stat.SPD, Stat.AG), Map.of()),
    CROUCHED(once(Stat.SPD, Stat.ARM), Map.of()),
    DEAD(Map.of(), Map.of()),
    ENGAGED(Map.of(), Map.of()),
    FATIGUED(Map.of(), Map.of()),
    FLYING(Map.of(), once(Stat.SPD)),
    IMMOBILIZED(Map.of(), Map.of()),
    INCAPACITATED(Map.of(), Map.of()),
    PANICKED(Map.of(), Map.of()),
    POISONED(Map.of(), Map.of()),
    SHROUDED(Map.of(), Map.of()),
    SLOWED(once(Stat.SPD), Map.of()),
    /** Halved T and -1 STA. */
    WEAKENED(once(Stat.T), Map.of());

    /** Attribute → number of halvings (first argument). */
    public final Map<Stat, Integer> halves;
    /** Attribute → number of doublings (second argument; Flying doubles SPD). */
    public final Map<Stat, Integer> doubles;

    ModelState(Map<Stat, Integer> halves, Map<Stat, Integer> doubles) {
        this.halves = halves;
        this.doubles = doubles;
    }

    private static Map<Stat, Integer> once(Stat... stats) {
        Map<Stat, Integer> m = new EnumMap<>(Stat.class);
        for (Stat s : stats) {
            m.put(s, 1);
        }
        return Map.copyOf(m);
    }

    /** States that remove the model from activations and reactions (no AP). */
    public boolean outOfAction() {
        return this == DEAD || this == INCAPACITATED;
    }
}
