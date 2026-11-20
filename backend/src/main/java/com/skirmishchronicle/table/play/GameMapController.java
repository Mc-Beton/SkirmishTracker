package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Maps of 3D tables. Players read the published ones (to pick a map for a table); only admins make, change and
 * delete them (/api/admin/** is for the ADMIN role). What a map may contain is decided by the rules service,
 * which knows the grounds and the terrain elements of the game.
 */
@RestController
public class GameMapController {

    /** At most this many maps: every one is a choice in the "new table" form. */
    static final int MAX_MAPS = 40;

    public record MapView(UUID id, String name, String base, JsonNode items, boolean published, Instant updatedAt) {
    }

    public record MapInput(String name, String base, JsonNode items, Boolean published) {
    }

    private final GameMapStore maps;
    private final RulesClient rules;
    private final ObjectMapper json;

    public GameMapController(GameMapStore maps, RulesClient rules, ObjectMapper json) {
        this.maps = maps;
        this.rules = rules;
        this.json = json;
    }

    /** The published maps; with {@code all} (admins only) the drafts as well. */
    @GetMapping("/api/table/game-maps")
    public List<MapView> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean all) {
        CurrentUser actor = CurrentUser.from(jwt);
        boolean drafts = all && actor != null && actor.admin();
        return maps.list(drafts).stream().map(this::view).toList();
    }

    @PostMapping("/api/admin/table/game-maps")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public MapView create(@AuthenticationPrincipal Jwt jwt, @RequestBody MapInput body) {
        CurrentUser actor = admin(jwt);
        if (maps.count() >= MAX_MAPS) {
            throw new ApiException(HttpStatus.CONFLICT, "GAME_MAP_TOO_MANY");
        }
        JsonNode checked = check(body);
        UUID id = UUID.randomUUID();
        maps.insert(id, checked.path("name").asText(), checked.path("base").asText(), checked.path("items").toString(),
                Boolean.TRUE.equals(body.published()), actor.id());
        return view(maps.find(id).orElseThrow());
    }

    @PutMapping("/api/admin/table/game-maps/{id}")
    @Transactional
    public MapView update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody MapInput body) {
        admin(jwt);
        JsonNode checked = check(body);
        if (maps.update(id, checked.path("name").asText(), checked.path("base").asText(), checked.path("items").toString(),
                Boolean.TRUE.equals(body.published())) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "GAME_MAP_NOT_FOUND");
        }
        return view(maps.find(id).orElseThrow());
    }

    /** Tables already created keep their field (it is in their events), so a map can be deleted at any time. */
    @DeleteMapping("/api/admin/table/game-maps/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        admin(jwt);
        if (maps.delete(id) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "GAME_MAP_NOT_FOUND");
        }
    }

    private static CurrentUser admin(Jwt jwt) {
        CurrentUser actor = CurrentUser.from(jwt);
        if (actor == null || !actor.admin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        return actor;
    }

    /** The map as the rules service accepts it ({name, base, items}); what it refuses comes back as 409 TABLE_RULE. */
    private JsonNode check(MapInput body) {
        if (body == null || body.items() == null || !body.items().isArray() || body.items().toString().length() > 20000
                || body.name() == null || body.name().length() > 80 || body.base() == null || body.base().length() > 40) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "GAME_MAP_BAD");
        }
        ObjectNode req = json.createObjectNode();
        req.put("name", body.name());
        req.put("base", body.base());
        req.set("items", body.items());
        return rules.post("/map", req);
    }

    private MapView view(GameMapStore.Row r) {
        try {
            return new MapView(r.id(), r.name(), r.base(), json.readTree(r.items()), r.published(), r.updatedAt());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("corrupt game map " + r.id(), e);
        }
    }
}
