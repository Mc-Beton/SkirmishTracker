package com.skirmishchronicle.content;

import java.util.List;
import java.util.Map;

/** Game reference data (scenarios, schemes, faction scheme tables) loaded from content/eldfall-core.json. */
public record GameContent(
        String version,
        String source,
        int turns,
        List<DrawRule> schemeDraw,
        List<Faction> factions,
        Map<String, List<TableRow>> schemeTables,
        List<Scheme> schemes,
        List<Quest> quests) {

    public record Localized(String pl, String en) {
    }

    /** Leader INT up to maxInt (null = any higher) draws this many scheme cards. */
    public record DrawRule(Integer maxInt, int cards) {
    }

    /** {@code schemeTable} is null while the faction's d20 table is not known yet (Oni Clans, Goblin Wartribes). */
    public record Faction(String code, String name, String schemeTable) {
    }

    /** d20 roll range → scheme code. */
    public record TableRow(int from, int to, String scheme) {
    }

    public record Scheme(String code, String name, int maxVp, String timing, Localized text) {
    }

    public record Result(Localized text, Integer vp, String when) {
    }

    public record Rule(Localized title, Localized text) {
    }

    public record Quest(String code, String name, Localized deployment, List<Localized> setup, List<Result> results,
                        List<Localized> endConditions, List<Localized> important, List<Rule> rules,
                        Localized classBonus) {
    }
}
