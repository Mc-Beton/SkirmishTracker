package com.skirmishchronicle.club;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Players' teams (tables clubs, club_members, club_requests) and the team name kept on the user (users.club). */
@Repository
public class ClubStore {

    public record Club(UUID id, String name, UUID ownerId, Instant createdAt) {
    }

    /** A player with the day they joined (members) or were invited / asked (requests). */
    public record Person(UUID id, String name, Instant since) {
    }

    /** A team in a list: its name, owner and size. */
    public record Listed(UUID id, String name, String owner, int members) {
    }

    private final JdbcTemplate jdbc;

    public ClubStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Club> find(UUID id) {
        return jdbc.query("select id, name, owner_id, created_at from clubs where id = ?", (rs, i) -> club(rs), id)
                .stream().findFirst();
    }

    /** As {@link #find}, locking the team's row: joins, removals and the size limit run one at a time. */
    public Optional<Club> findForUpdate(UUID id) {
        return jdbc.query("select id, name, owner_id, created_at from clubs where id = ? for update", (rs, i) -> club(rs), id)
                .stream().findFirst();
    }

    public Optional<Club> findByInvite(String hash) {
        return jdbc.query("select id, name, owner_id, created_at from clubs where invite_hash = ?", (rs, i) -> club(rs), hash)
                .stream().findFirst();
    }

    /** The team the player is in. */
    public Optional<Club> ofUser(UUID userId) {
        return jdbc.query("select c.id, c.name, c.owner_id, c.created_at from clubs c join club_members m on m.club_id = c.id "
                + "where m.user_id = ?", (rs, i) -> club(rs), userId).stream().findFirst();
    }

    public boolean nameTaken(String name, UUID exceptId) {
        Integer n = jdbc.queryForObject("select count(*) from clubs where lower(name) = lower(?) and id <> ?", Integer.class,
                name, exceptId == null ? new UUID(0, 0) : exceptId);
        return n != null && n > 0;
    }

    public void insert(UUID id, String name, UUID ownerId) {
        jdbc.update("insert into clubs (id, name, owner_id, created_at) values (?, ?, ?, ?)", id, name, ownerId, now());
    }

    public void rename(UUID id, String name) {
        jdbc.update("update clubs set name = ? where id = ?", name, id);
        jdbc.update("update users set club = ? where id in (select user_id from club_members where club_id = ?)", name, id);
    }

    public void setOwner(UUID id, UUID ownerId) {
        jdbc.update("update clubs set owner_id = ? where id = ?", ownerId, id);
    }

    public void setInvite(UUID id, String hash) {
        jdbc.update("update clubs set invite_hash = ? where id = ?", hash, id);
    }

    public boolean hasInvite(UUID id) {
        Integer n = jdbc.queryForObject("select count(*) from clubs where id = ? and invite_hash is not null", Integer.class, id);
        return n != null && n > 0;
    }

    /** The team is gone; its members have no team any more. */
    public void delete(UUID id) {
        jdbc.update("update users set club = null where id in (select user_id from club_members where club_id = ?)", id);
        jdbc.update("delete from clubs where id = ?", id);
    }

    public List<Person> members(UUID clubId) {
        return jdbc.query("select u.id, u.display_name, m.joined_at from club_members m join users u on u.id = m.user_id "
                + "where m.club_id = ? order by m.joined_at, u.display_name", (rs, i) -> new Person(rs.getObject("id", UUID.class),
                rs.getString("display_name"), rs.getTimestamp("joined_at").toInstant()), clubId);
    }

    public int memberCount(UUID clubId) {
        Integer n = jdbc.queryForObject("select count(*) from club_members where club_id = ?", Integer.class, clubId);
        return n == null ? 0 : n;
    }

    public boolean isMember(UUID clubId, UUID userId) {
        Integer n = jdbc.queryForObject("select count(*) from club_members where club_id = ? and user_id = ?", Integer.class,
                clubId, userId);
        return n != null && n > 0;
    }

    /** The player joins: every open invitation and request of theirs is closed, their profile shows the team. */
    public void addMember(UUID clubId, String clubName, UUID userId) {
        jdbc.update("insert into club_members (club_id, user_id, joined_at) values (?, ?, ?)", clubId, userId, now());
        jdbc.update("delete from club_requests where user_id = ?", userId);
        jdbc.update("update users set club = ? where id = ?", clubName, userId);
    }

    public void removeMember(UUID clubId, UUID userId) {
        jdbc.update("delete from club_members where club_id = ? and user_id = ?", clubId, userId);
        jdbc.update("update users set club = null where id = ?", userId);
    }

    /** INVITE or REQUEST between this team and this player, if there is one. */
    public Optional<String> requestKind(UUID clubId, UUID userId) {
        return jdbc.query("select kind from club_requests where club_id = ? and user_id = ?", (rs, i) -> rs.getString(1),
                clubId, userId).stream().findFirst();
    }

    public void putRequest(UUID clubId, UUID userId, String kind) {
        jdbc.update("delete from club_requests where club_id = ? and user_id = ?", clubId, userId);
        jdbc.update("insert into club_requests (club_id, user_id, kind, created_at) values (?, ?, ?, ?)", clubId, userId, kind, now());
    }

    public int deleteRequest(UUID clubId, UUID userId, String kind) {
        return jdbc.update("delete from club_requests where club_id = ? and user_id = ? and kind = ?", clubId, userId, kind);
    }

    public List<Person> requests(UUID clubId, String kind) {
        return jdbc.query("select u.id, u.display_name, r.created_at from club_requests r join users u on u.id = r.user_id "
                + "where r.club_id = ? and r.kind = ? order by r.created_at", (rs, i) -> new Person(rs.getObject("id", UUID.class),
                rs.getString("display_name"), rs.getTimestamp("created_at").toInstant()), clubId, kind);
    }

    public int requestCount(UUID clubId) {
        Integer n = jdbc.queryForObject("select count(*) from club_requests where club_id = ?", Integer.class, clubId);
        return n == null ? 0 : n;
    }

    public int requestCountOfUser(UUID userId, String kind) {
        Integer n = jdbc.queryForObject("select count(*) from club_requests where user_id = ? and kind = ?", Integer.class,
                userId, kind);
        return n == null ? 0 : n;
    }

    /** Teams that invited the player (INVITE) or that the player asked to join (REQUEST). */
    public List<Listed> requestsOfUser(UUID userId, String kind) {
        return jdbc.query(LISTED + " where c.id in (select club_id from club_requests where user_id = ? and kind = ?) order by c.name",
                (rs, i) -> listed(rs), userId, kind);
    }

    /** Teams whose name contains the text (all of them for an empty text), at most {@code limit}. */
    public List<Listed> search(String text, int limit) {
        String like = "%" + text.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query(LISTED + " where lower(c.name) like ? order by c.name limit ?", (rs, i) -> listed(rs), like, limit);
    }

    public boolean userExists(UUID userId) {
        Integer n = jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, userId);
        return n != null && n > 0;
    }

    public String userName(UUID userId) {
        return jdbc.query("select display_name from users where id = ?", (rs, i) -> rs.getString(1), userId).stream()
                .findFirst().orElse("?");
    }

    private static final String LISTED = "select c.id, c.name, u.display_name as owner, "
            + "(select count(*) from club_members m where m.club_id = c.id) as members from clubs c join users u on u.id = c.owner_id";

    private static Listed listed(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Listed(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("owner"), rs.getInt("members"));
    }

    private static Club club(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Club(rs.getObject("id", UUID.class), rs.getString("name"), rs.getObject("owner_id", UUID.class),
                rs.getTimestamp("created_at").toInstant());
    }

    private static Timestamp now() {
        return Timestamp.from(Instant.now());
    }
}
