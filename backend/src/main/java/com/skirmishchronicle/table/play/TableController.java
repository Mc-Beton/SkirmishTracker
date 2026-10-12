package com.skirmishchronicle.table.play;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.table.engine.Command;
import com.skirmishchronicle.table.geo.Geometry;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Online tables: create, join by invitation, play (commands), live hints. Players, the judge and allowed observers only. */
@RestController
@RequestMapping("/api/tables")
public class TableController {

    public record CreateRequest(@NotNull UUID mapId, @NotNull UUID listId, @Size(max = 60) String questCode,
                                GameTable.MeasureMode measureMode, Boolean judge, Boolean observers) {
    }

    public record InviteRequest(@NotNull @Size(max = 100) String invite) {
    }

    public record NewInviteRequest(@NotNull TableService.InviteKind kind) {
    }

    public record ObserversRequest(@NotNull Boolean allowed) {
    }

    public record JoinRequest(@NotNull @Size(max = 100) String invite, @NotNull UUID listId) {
    }

    /**
     * One command, flat: {@code type} picks the command, the other fields are its arguments.
     * Types: FIRST_PLAYER, DEPLOY, READY, ACTIVATE, MOVE, FREE_MOVE, ROTATE, REACT, ROLL, HP, STATE, AP,
     * END_ACTIVATION, END_TURN, UNDO, CONCEDE, DRAW_SCHEMES, KEEP_SCHEME, PLACE_TOKEN, MOVE_TOKEN, REMOVE_TOKEN, VP,
     * PLACE_TEMPLATE, REMOVE_TEMPLATE, END_GAME. Tokens and templates use {@code id} for their own id.
     */
    public record CommandRequest(@NotNull @Size(max = 20) String type, @Size(max = 10) String id, Double x, Double y,
                                 Double facing, @Size(max = 5) String mode, @Size(max = 20) List<Vec> waypoints,
                                 Integer side, @Size(max = 60) String label, Integer count, Integer target, Integer delta,
                                 @Size(max = 20) String state, Boolean on, Integer ap, @Size(max = 20) String kind,
                                 @Size(max = 60) String scheme, Integer round, Integer vpScenario, Integer vpScheme,
                                 Long toSeq) {

        Command toCommand() {
            return switch (type) {
                case "FIRST_PLAYER" -> new Command.SetFirstPlayer(req(side));
                case "DEPLOY" -> new Command.Deploy(modelId(), point(x, y), angle());
                case "READY" -> new Command.Ready();
                case "ACTIVATE" -> new Command.Activate(modelId());
                case "MOVE" -> new Command.Move(modelId(), moveMode(), route());
                case "FREE_MOVE" -> new Command.FreeMove(modelId(), point(x, y), angle());
                case "ROTATE" -> new Command.Rotate(modelId(), angle());
                case "REACT" -> new Command.React(modelId());
                case "ROLL" -> new Command.Roll(label, id, req(count), target);
                case "HP" -> new Command.ChangeHp(modelId(), req(delta));
                case "STATE" -> new Command.SetState(modelId(), modelState(), on == null || on);
                case "AP" -> new Command.SetAp(modelId(), req(ap));
                case "END_ACTIVATION" -> new Command.EndActivation();
                case "END_TURN" -> new Command.EndTurn();
                case "UNDO" -> new Command.Undo(toSeq);
                case "CONCEDE" -> new Command.Concede();
                case "DRAW_SCHEMES" -> new Command.DrawSchemes(null);
                case "KEEP_SCHEME" -> new Command.KeepScheme(text(scheme));
                case "PLACE_TOKEN" -> new Command.PlaceToken(text(kind), point(x, y), label);
                case "MOVE_TOKEN" -> new Command.MoveToken(modelId(), point(x, y));
                case "REMOVE_TOKEN" -> new Command.RemoveToken(modelId());
                case "VP" -> new Command.SetVp(req(side), req(round), req(vpScenario), req(vpScheme));
                case "PLACE_TEMPLATE" -> new Command.PlaceTemplate(text(kind), point(x, y), angle(), blankToNull(id), label);
                case "REMOVE_TEMPLATE" -> new Command.RemoveTemplate(modelId());
                case "END_GAME" -> new Command.EndGame();
                default -> throw bad();
            };
        }

        private String modelId() {
            if (id == null || id.isBlank()) {
                throw bad();
            }
            return id;
        }

        private double angle() {
            if (facing == null || !Double.isFinite(facing)) {
                throw bad();
            }
            return facing;
        }

        private Geometry.MoveMode moveMode() {
            try {
                return Geometry.MoveMode.valueOf(mode);
            } catch (RuntimeException e) {
                throw bad();
            }
        }

        private ModelState modelState() {
            try {
                return ModelState.valueOf(state);
            } catch (RuntimeException e) {
                throw bad();
            }
        }

        private List<Vec> route() {
            if (waypoints == null || waypoints.isEmpty()) {
                throw bad();
            }
            return waypoints.stream().map(w -> point(w == null ? null : w.x(), w == null ? null : w.y())).toList();
        }

        private static String text(String v) {
            if (v == null || v.isBlank()) {
                throw bad();
            }
            return v;
        }

        private static String blankToNull(String v) {
            return v == null || v.isBlank() ? null : v;
        }

        private static Vec point(Double x, Double y) {
            if (x == null || y == null || !Double.isFinite(x) || !Double.isFinite(y) || Math.abs(x) > 200 || Math.abs(y) > 200) {
                throw bad();
            }
            return new Vec(x, y);
        }

        private static int req(Integer v) {
            if (v == null) {
                throw bad();
            }
            return v;
        }

        private static ApiException bad() {
            return new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_COMMAND");
        }
    }

    private final TableService tables;

    public TableController(TableService tables) {
        this.tables = tables;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TableService.Created create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest body) {
        return tables.create(CurrentUser.from(jwt), body.mapId(), body.listId(), body.questCode(), body.measureMode(),
                Boolean.TRUE.equals(body.judge()), Boolean.TRUE.equals(body.observers()));
    }

    @PostMapping("/judge")
    public Map<String, UUID> judge(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody InviteRequest body) {
        return Map.of("id", tables.joinAsJudge(CurrentUser.from(jwt), body.invite()));
    }

    @PostMapping("/watch")
    public Map<String, UUID> watch(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody InviteRequest body) {
        return Map.of("id", tables.watch(CurrentUser.from(jwt), body.invite()));
    }

    /** Creator only: a fresh player / judge / watch link. */
    @PostMapping("/{id}/invites")
    public Map<String, String> newInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                         @Valid @RequestBody NewInviteRequest body) {
        return Map.of("invite", tables.newInvite(CurrentUser.from(jwt), id, body.kind()));
    }

    /** Creator only: observers on (returns the watch link) or off. */
    @PostMapping("/{id}/observers")
    public Map<String, String> observers(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                         @Valid @RequestBody ObserversRequest body) {
        String invite = tables.setObservers(CurrentUser.from(jwt), id, body.allowed());
        return invite == null ? Map.of() : Map.of("invite", invite);
    }

    @PostMapping("/join")
    public Map<String, UUID> join(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody JoinRequest body) {
        return Map.of("id", tables.join(CurrentUser.from(jwt), body.invite(), body.listId()));
    }

    @GetMapping("/mine")
    public List<TableService.Summary> mine(@AuthenticationPrincipal Jwt jwt) {
        return tables.mine(CurrentUser.from(jwt));
    }

    @GetMapping("/{id}")
    public TableView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return tables.view(CurrentUser.from(jwt), id);
    }

    @PostMapping("/{id}/commands")
    public TableView command(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                             @Valid @RequestBody CommandRequest body) {
        return tables.command(CurrentUser.from(jwt), id, body.toCommand());
    }

    /** Reports the finished game as an own game (the opponent confirms it). */
    @PostMapping("/{id}/report")
    public Map<String, UUID> report(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return Map.of("gameId", tables.report(CurrentUser.from(jwt), id));
    }

    @GetMapping(path = "/{id}/live", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter live(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, HttpServletResponse response) {
        CurrentUser user = CurrentUser.from(jwt);
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        return tables.stream(user, id, "u:" + user.id());
    }
}
