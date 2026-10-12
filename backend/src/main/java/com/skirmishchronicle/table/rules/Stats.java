package com.skirmishchronicle.table.rules;

import java.util.Collection;
import java.util.EnumMap;
import java.util.Map;

/**
 * Effective profile of a model on the table (rulebook p.18 "Modifiers" + errata):
 * add and subtract flat modifiers first, then halve or double, rounding up after each halving;
 * a halving and a doubling of the same attribute cancel out; attributes never go below 0.
 */
public final class Stats {

    private Stats() {
    }

    /**
     * @param base    printed profile
     * @param flat    flat modifiers (mount, Weakened's -1 STA is added here automatically, manual tweaks)
     * @param setTo   values replaced outright (a mount's SPD)
     * @param states  active States
     * @param extraHalves halvings that come from the environment (e.g. AG in Shallow water)
     */
    public static Map<Stat, Integer> effective(Map<Stat, Integer> base, Map<Stat, Integer> flat, Map<Stat, Integer> setTo,
                                               Collection<ModelState> states, Map<Stat, Integer> extraHalves) {
        Map<Stat, Integer> out = new EnumMap<>(Stat.class);
        for (Stat s : Stat.values()) {
            int v = setTo.containsKey(s) ? setTo.get(s) : base.getOrDefault(s, 0);
            v += flat.getOrDefault(s, 0);
            if (s == Stat.STA && states.contains(ModelState.WEAKENED)) {
                v -= 1;
            }
            int halves = extraHalves.getOrDefault(s, 0), doubles = 0;
            for (ModelState st : states) {
                halves += st.halves.getOrDefault(s, 0);
                doubles += st.doubles.getOrDefault(s, 0);
            }
            int cancel = Math.min(halves, doubles);
            halves -= cancel;
            doubles -= cancel;
            v = Math.max(0, v);
            for (int i = 0; i < halves; i++) {
                v = (v + 1) / 2; // halve, round up
            }
            for (int i = 0; i < doubles; i++) {
                v *= 2;
            }
            out.put(s, v);
        }
        return out;
    }
}
