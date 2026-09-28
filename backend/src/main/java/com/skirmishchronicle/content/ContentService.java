package com.skirmishchronicle.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.content.GameContent.DrawRule;
import com.skirmishchronicle.content.GameContent.Faction;
import com.skirmishchronicle.content.GameContent.Quest;
import com.skirmishchronicle.content.GameContent.TableRow;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
public class ContentService {

    public record DrawnCard(String scheme, int roll) {
    }

    private final GameContent content;
    private final ArmyContent armies;

    public ContentService(ObjectMapper mapper) throws IOException {
        try (InputStream in = new ClassPathResource("content/eldfall-core.json").getInputStream()) {
            this.content = mapper.readValue(in, GameContent.class);
        }
        try (InputStream in = new ClassPathResource("content/eldfall-armies.json").getInputStream()) {
            this.armies = mapper.readValue(in, ArmyContent.class);
        }
    }

    public GameContent content() {
        return content;
    }

    public ArmyContent armies() {
        return armies;
    }

    public Optional<ArmyContent.ArmyFaction> armyFaction(String code) {
        return armies.factions().stream().filter(f -> f.code().equals(code)).findFirst();
    }

    public Optional<ArmyContent.Unit> unit(String code) {
        return armies.units().stream().filter(u -> u.code().equals(code)).findFirst();
    }

    public Optional<ArmyContent.Item> item(String code) {
        return armies.items().stream().filter(i -> i.code().equals(code)).findFirst();
    }

    /**
     * Characters a warband may recruit: own list, always-available lists (Adventurers Guild) and the chosen ally.
     * Characters shared by several lists have one code.
     */
    public Set<String> unitsFor(String factionCode, String alliedCode) {
        Set<String> codes = new java.util.LinkedHashSet<>();
        armyFaction(factionCode).ifPresent(f -> {
            codes.addAll(armies.lists().getOrDefault(f.code(), List.of()));
            f.alwaysAvailable().forEach(s -> codes.addAll(armies.lists().getOrDefault(s, List.of())));
            if (alliedCode != null && f.optionalAllies().contains(alliedCode)) {
                codes.addAll(armies.lists().getOrDefault(alliedCode, List.of()));
            }
        });
        return codes;
    }

    /** Items a warband of this faction may buy: neutral ones plus the faction's own. */
    public Set<String> itemsFor(String factionCode) {
        Set<String> codes = new java.util.LinkedHashSet<>(armies.itemLists().getOrDefault(ArmyContent.NEUTRAL, List.of()));
        codes.addAll(armies.itemLists().getOrDefault(factionCode, List.of()));
        return codes;
    }

    public Optional<Quest> quest(String code) {
        return content.quests().stream().filter(q -> q.code().equals(code)).findFirst();
    }

    public Optional<Faction> faction(String code) {
        return content.factions().stream().filter(f -> f.code().equals(code)).findFirst();
    }

    public boolean hasSchemeTable(String factionCode) {
        return faction(factionCode).map(f -> f.schemeTable() != null
                && content.schemeTables().containsKey(f.schemeTable())).orElse(false);
    }

    public int turns() {
        return content.turns();
    }

    /** Number of scheme cards drawn for a leader with this INT. */
    public int cardsFor(int leaderInt) {
        for (DrawRule rule : content.schemeDraw()) {
            if (rule.maxInt() == null || leaderInt <= rule.maxInt()) {
                return rule.cards();
            }
        }
        return 1;
    }

    /**
     * Rolls d20 on the faction's scheme table until the required number of <em>different</em> schemes is drawn
     * (cards in a deck are unique, so repeated results are re-rolled).
     */
    public List<DrawnCard> drawSchemes(String factionCode, int leaderInt, Random random) {
        Faction faction = faction(factionCode).orElseThrow(() -> new IllegalArgumentException("faction"));
        List<TableRow> table = faction.schemeTable() == null ? null : content.schemeTables().get(faction.schemeTable());
        if (table == null) {
            throw new IllegalStateException("no scheme table for " + factionCode);
        }
        long distinct = table.stream().map(TableRow::scheme).distinct().count();
        int wanted = (int) Math.min(cardsFor(leaderInt), distinct);
        List<DrawnCard> cards = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        while (cards.size() < wanted) {
            int roll = 1 + random.nextInt(20);
            String scheme = table.stream().filter(r -> roll >= r.from() && roll <= r.to())
                    .map(TableRow::scheme).findFirst().orElseThrow();
            if (seen.add(scheme)) {
                cards.add(new DrawnCard(scheme, roll));
            }
        }
        return cards;
    }
}
