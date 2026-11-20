package com.skirmishchronicle.table.play;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Maps of 3D tables made in the admin's map creator (table game_maps). {@code items}: the placements as JSON. */
@Repository
public class GameMapStore {

    public record Row(UUID id, String name, String base, String items, boolean published, Instant updatedAt) {
    }

    private static final String COLUMNS = "id, name, base, items, published, updated_at";

    private final JdbcTemplate jdbc;

    public GameMapStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Row> list(boolean all) {
        return jdbc.query("select " + COLUMNS + " from game_maps" + (all ? "" : " where published") + " order by name, created_at",
                (rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("base"), rs.getString("items"),
                        rs.getBoolean("published"), rs.getTimestamp("updated_at").toInstant()));
    }

    public Optional<Row> find(UUID id) {
        return jdbc.query("select " + COLUMNS + " from game_maps where id = ?",
                (rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("base"), rs.getString("items"),
                        rs.getBoolean("published"), rs.getTimestamp("updated_at").toInstant()), id).stream().findFirst();
    }

    public int count() {
        Integer n = jdbc.queryForObject("select count(*) from game_maps", Integer.class);
        return n == null ? 0 : n;
    }

    public void insert(UUID id, String name, String base, String items, boolean published, UUID author) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("insert into game_maps (id, name, base, items, published, created_by, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?, ?, ?, ?)", id, name, base, items, published, author, now, now);
    }

    public int update(UUID id, String name, String base, String items, boolean published) {
        return jdbc.update("update game_maps set name = ?, base = ?, items = ?, published = ?, updated_at = ? where id = ?",
                name, base, items, published, Timestamp.from(Instant.now()), id);
    }

    public int delete(UUID id) {
        return jdbc.update("delete from game_maps where id = ?", id);
    }
}
