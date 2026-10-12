package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.table.engine.GameEvent;
import com.skirmishchronicle.table.engine.Recorded;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Append-only log of table events (JSON payload per event, type kept in a column for SQL queries). */
@Repository
public class TableEventStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public TableEventStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<Recorded> load(UUID tableId) {
        return jdbc.query("select seq, side, author_id, payload, created_at from table_events where table_id = ? order by seq",
                (rs, i) -> new Recorded(rs.getLong("seq"), rs.getInt("side"), rs.getObject("author_id", UUID.class),
                        rs.getTimestamp("created_at").toInstant(), parse(rs.getString("payload"))), tableId);
    }

    public void append(UUID tableId, Recorded r) {
        String type = typeName(r.event());
        jdbc.update("insert into table_events (table_id, seq, side, author_id, type, payload, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                tableId, r.seq(), r.side(), r.author(), type, write(r.event()), Timestamp.from(r.at()));
    }

    static String typeName(GameEvent e) {
        for (var t : GameEvent.class.getAnnotation(com.fasterxml.jackson.annotation.JsonSubTypes.class).value()) {
            if (t.value() == e.getClass()) {
                return t.name();
            }
        }
        throw new IllegalStateException("no type name for " + e.getClass());
    }

    private GameEvent parse(String s) {
        try {
            return json.readValue(s, GameEvent.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("corrupt table event", e);
        }
    }

    private String write(GameEvent e) {
        try {
            // the type id is written by @JsonTypeInfo only when serialising through the base type
            return json.writerFor(GameEvent.class).writeValueAsString(e);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
