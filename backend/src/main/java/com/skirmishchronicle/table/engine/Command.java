package com.skirmishchronicle.table.engine;

import com.skirmishchronicle.table.geo.Geometry.MoveMode;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import java.util.List;

/** What a player asks the table to do; {@link TableEngine#decide} validates it and returns events. */
public sealed interface Command {

    record SetFirstPlayer(int side) implements Command {
    }

    record Deploy(String id, Vec pos, double facing) implements Command {
    }

    record Ready() implements Command {
    }

    record Activate(String id) implements Command {
    }

    record Move(String id, MoveMode mode, List<Vec> waypoints) implements Command {
    }

    record FreeMove(String id, Vec pos, double facing) implements Command {
    }

    record Rotate(String id, double facing) implements Command {
    }

    record React(String id) implements Command {
    }

    record Roll(String label, String id, int count, Integer target) implements Command {
    }

    record ChangeHp(String id, int delta) implements Command {
    }

    record SetState(String id, ModelState state, boolean on) implements Command {
    }

    record SetAp(String id, int ap) implements Command {
    }

    record EndActivation() implements Command {
    }

    record EndTurn() implements Command {
    }

    /**
     * Players: take back the own latest steps. Judge: take back everything after {@code toSeq}
     * (null = only the latest step), dice and earlier turns included.
     */
    record Undo(Long toSeq) implements Command {
        public Undo() {
            this(null);
        }
    }

    record Concede() implements Command {
    }

    /** Cards are rolled by the caller (TableService, server dice) – the engine checks it is allowed. */
    record DrawSchemes(List<GameEvent.SchemeCard> cards) implements Command {
    }

    record KeepScheme(String scheme) implements Command {
    }

    record PlaceToken(String kind, Vec pos, String label) implements Command {
    }

    record MoveToken(String id, Vec pos) implements Command {
    }

    record RemoveToken(String id) implements Command {
    }

    record SetVp(int side, int round, int scenario, int scheme) implements Command {
    }

    record PlaceTemplate(String kind, Vec pos, double rotation, String modelId, String label) implements Command {
    }

    record RemoveTemplate(String id) implements Command {
    }

    /** Proposes the end of the game, or accepts the opponent's proposal (winner by Victory Points). */
    record EndGame() implements Command {
    }
}
