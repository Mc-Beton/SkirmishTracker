package com.skirmishchronicle.table.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.table.geo.Size;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Model profiles for the table, read from {@code content/eldfall-profiles.json} (tools/make_profiles.py). */
public final class Profiles {

    public record Profile(String code, String name, List<String> factions, List<String> classes, Size size,
                          Map<Stat, Integer> stats, List<String> keywords) {
    }

    /** A mount: replaces some values of its rider ({@code set}) and adds to others ({@code mod}). */
    public record Mount(String code, String name, Size size, Map<Stat, Integer> set, Map<Stat, Integer> mod,
                        List<String> keywords) {
    }

    private final Map<String, Profile> profiles;
    private final Map<String, Mount> mounts;

    private Profiles(Map<String, Profile> profiles, Map<String, Mount> mounts) {
        this.profiles = profiles;
        this.mounts = mounts;
    }

    public static Profiles load() {
        try (InputStream in = Profiles.class.getResourceAsStream("/content/eldfall-profiles.json")) {
            if (in == null) {
                throw new IllegalStateException("content/eldfall-profiles.json missing");
            }
            return parse(new ObjectMapper().readTree(in));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static Profiles parse(JsonNode root) {
        Map<String, Profile> ps = new LinkedHashMap<>();
        for (JsonNode m : root.get("models")) {
            Map<Stat, Integer> st = new EnumMap<>(Stat.class);
            for (Stat s : Stat.values()) {
                st.put(s, m.get(s.name()).asInt());
            }
            ps.put(m.get("code").asText(), new Profile(m.get("code").asText(), m.get("name").asText(),
                    strings(m.get("factions")), strings(m.get("classes")), Size.valueOf(m.get("size").asText()),
                    Map.copyOf(st), strings(m.get("keywords"))));
        }
        Map<String, Mount> ms = new LinkedHashMap<>();
        for (JsonNode m : root.path("mounts")) {
            ms.put(m.get("code").asText(), new Mount(m.get("code").asText(), m.get("name").asText(),
                    Size.valueOf(m.get("size").asText()), stats(m.get("set")), stats(m.get("mod")), strings(m.get("keywords"))));
        }
        return new Profiles(Map.copyOf(ps), Map.copyOf(ms));
    }

    private static List<String> strings(JsonNode n) {
        List<String> out = new ArrayList<>();
        if (n != null) {
            n.forEach(x -> out.add(x.asText()));
        }
        return List.copyOf(out);
    }

    private static Map<Stat, Integer> stats(JsonNode n) {
        Map<Stat, Integer> out = new EnumMap<>(Stat.class);
        if (n != null) {
            n.fields().forEachRemaining(e -> out.put(Stat.valueOf(e.getKey()), e.getValue().asInt()));
        }
        return Map.copyOf(out);
    }

    public Optional<Profile> profile(String code) {
        return Optional.ofNullable(profiles.get(code));
    }

    public Optional<Mount> mount(String code) {
        return Optional.ofNullable(mounts.get(code));
    }

    public java.util.Collection<Profile> all() {
        return profiles.values();
    }
}
