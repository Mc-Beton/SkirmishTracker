package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.databind.JsonNode;
import com.skirmishchronicle.common.CurrentUser;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tables that play by the game engine: the event log for the browser and the commands of the players
 * (the commands are the engine's own, see frontend/src/lib/eld/types.ts; the rules service checks them).
 * Live hints come from the same stream as for every table ({@code /api/tables/{id}/live}).
 */
@RestController
@RequestMapping("/api/tables")
public class TableGameController {

    private final TableGameService games;

    public TableGameController(TableGameService games) {
        this.games = games;
    }

    @GetMapping("/{id}/engine")
    public Map<String, String> engine(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return Map.of("engine", games.engine(CurrentUser.from(jwt), id));
    }

    @GetMapping("/{id}/game")
    public TableGameService.GameView game(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                          @RequestParam(defaultValue = "0") long after) {
        return games.view(CurrentUser.from(jwt), id, after);
    }

    @PostMapping("/{id}/game/commands")
    public Map<String, Long> command(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody JsonNode body) {
        return Map.of("seq", games.command(CurrentUser.from(jwt), id, body));
    }
}
