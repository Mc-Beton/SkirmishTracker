package com.skirmishchronicle.table.engine;

import java.time.Instant;
import java.util.UUID;

/** An event in the table log: sequence number, who did it (side 0/1, -1 = system) and when. */
public record Recorded(long seq, int side, UUID author, Instant at, GameEvent event) {
}
