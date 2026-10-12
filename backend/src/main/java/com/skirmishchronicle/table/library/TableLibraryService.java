package com.skirmishchronicle.table.library;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.table.geo.TerrainShapes;
import com.skirmishchronicle.table.geo.Vec;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Terrain library and maps for the online table.
 * <ul>
 *   <li>Admins upload pictures, describe map backgrounds (natural areas: water, forest…) and terrain pieces
 *       (walls with thickness, obstacles, areas drawn over the picture).</li>
 *   <li>Every player builds maps from a background and any number of pieces, keeps them private or shares them;
 *       admins publish official maps. Maps are searched by name or by the author's name.</li>
 * </ul>
 */
@Service
public class TableLibraryService {

    public static final int MAX_MAPS_PER_USER = 40;
    public static final int MAX_PLACEMENTS = 80;
    public static final int MAX_SHAPES = 40;
    public static final int MAX_POINTS = 64;
    public static final Set<String> CATEGORIES = Set.of("RUIN", "BUILDING", "TREE", "FOREST", "WATER", "ROCK", "WALL", "OTHER");
    private static final String AUDIT = "TABLE_LIBRARY";

    // ------------------------------------------------------------------ views

    public record ImageView(UUID id, String contentType, int widthPx, int heightPx) {
    }

    public record BackgroundInput(String name, UUID imageId, double widthIn, double heightIn, List<TerrainShapes.Area> areas) {
    }

    public record BackgroundView(UUID id, String name, UUID imageId, double widthIn, double heightIn,
                                 List<TerrainShapes.Area> areas, boolean active) {
    }

    public record TerrainInput(String name, String category, UUID imageId, double widthIn, double heightIn,
                               List<TerrainShapes.Shape> shapes) {
    }

    public record TerrainView(UUID id, String name, String category, UUID imageId, double widthIn, double heightIn,
                              List<TerrainShapes.Shape> shapes, boolean active) {
    }

    public record MapInput(String name, UUID backgroundId, List<TerrainShapes.Placement> placements,
                           Double deploymentDepth, boolean isPublic, boolean official) {
    }

    public record Author(UUID id, String name) {
    }

    public record MapSummary(UUID id, String name, Author author, boolean official, boolean isPublic, boolean mine,
                             UUID backgroundId, UUID backgroundImageId, int pieces, Instant updatedAt) {
    }

    public record MapView(UUID id, String name, Author author, boolean official, boolean isPublic, boolean mine,
                          BackgroundView background, List<TerrainShapes.Placement> placements, double deploymentDepth,
                          List<TerrainView> terrain) {
    }

    private final TableImageRepository images;
    private final TableBackgroundRepository backgrounds;
    private final TerrainPieceRepository pieces;
    private final TableMapRepository maps;
    private final UserRepository users;
    private final AuditService audit;
    private final ObjectMapper json;

    public TableLibraryService(TableImageRepository images, TableBackgroundRepository backgrounds,
                               TerrainPieceRepository pieces, TableMapRepository maps, UserRepository users,
                               AuditService audit, ObjectMapper json) {
        this.images = images;
        this.backgrounds = backgrounds;
        this.pieces = pieces;
        this.maps = maps;
        this.users = users;
        this.audit = audit;
        this.json = json;
    }

    // ------------------------------------------------------------------ images

    @Transactional
    public ImageView upload(CurrentUser actor, byte[] bytes) {
        requireAdmin(actor);
        ImageCheck.Info info = ImageCheck.inspect(bytes);
        if (info == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_IMAGE_INVALID");
        }
        String sha = sha256(bytes);
        TableImage img = images.findFirstBySha256(sha)
                .orElseGet(() -> images.save(new TableImage(actor.id(), info.contentType(), bytes, info.width(), info.height(), sha)));
        return new ImageView(img.getId(), img.getContentType(), img.getWidthPx(), img.getHeightPx());
    }

    @Transactional(readOnly = true)
    public TableImage image(UUID id) {
        return images.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_IMAGE_NOT_FOUND"));
    }

    // ------------------------------------------------------------------ backgrounds

    @Transactional(readOnly = true)
    public List<BackgroundView> backgrounds() {
        return backgrounds.findByActiveTrueOrderByNameAsc().stream().map(this::view).toList();
    }

    @Transactional
    public BackgroundView saveBackground(CurrentUser actor, UUID id, BackgroundInput in) {
        requireAdmin(actor);
        String name = name(in.name());
        imageExists(in.imageId());
        if (!between(in.widthIn(), 12, 72) || !between(in.heightIn(), 12, 72)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SIZE");
        }
        List<TerrainShapes.Area> areas = in.areas() == null ? List.of() : in.areas();
        if (areas.size() > MAX_SHAPES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_TOO_MANY_SHAPES");
        }
        for (TerrainShapes.Area a : areas) {
            polygon(a.points(), 0, in.widthIn(), 0, in.heightIn());
            height(a.height());
            if (a.envs().isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_AREA_WITHOUT_ENVIRONMENT");
            }
        }
        TableBackground b = id == null ? new TableBackground(actor.id()) : background(id);
        b.update(name, in.imageId(), in.widthIn(), in.heightIn(), write(areas));
        backgrounds.save(b);
        audit.record(actor.id(), AUDIT, b.getId(), id == null ? "BACKGROUND_CREATED" : "BACKGROUND_UPDATED", name);
        return view(b);
    }

    @Transactional
    public void retireBackground(CurrentUser actor, UUID id) {
        requireAdmin(actor);
        TableBackground b = background(id);
        b.setActive(false); // maps and games keep using it; it is only hidden from the editor
        audit.record(actor.id(), AUDIT, id, "BACKGROUND_RETIRED", b.getName());
    }

    // ------------------------------------------------------------------ terrain pieces

    @Transactional(readOnly = true)
    public List<TerrainView> terrain() {
        return pieces.findByActiveTrueOrderByCategoryAscNameAsc().stream().map(this::view).toList();
    }

    @Transactional
    public TerrainView saveTerrain(CurrentUser actor, UUID id, TerrainInput in) {
        requireAdmin(actor);
        String name = name(in.name());
        if (in.category() == null || !CATEGORIES.contains(in.category())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_CATEGORY");
        }
        imageExists(in.imageId());
        if (!between(in.widthIn(), 0.25, 36) || !between(in.heightIn(), 0.25, 36)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SIZE");
        }
        List<TerrainShapes.Shape> shapes = in.shapes() == null ? List.of() : in.shapes();
        if (shapes.isEmpty() || shapes.size() > MAX_SHAPES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_TOO_MANY_SHAPES");
        }
        double hx = in.widthIn() / 2 + 0.5, hy = in.heightIn() / 2 + 0.5;
        for (TerrainShapes.Shape s : shapes) {
            if (s.type() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SHAPE");
            }
            height(s.height());
            switch (s.type()) {
                case WALL -> {
                    points(s.points(), 2, -hx, hx, -hy, hy);
                    if (!between(s.thickness(), 0.05, 3)) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_THICKNESS");
                    }
                    if (s.height() <= 0) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_HEIGHT");
                    }
                }
                case OBSTACLE -> {
                    polygon(s.points(), -hx, hx, -hy, hy);
                    if (s.height() <= 0) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_HEIGHT");
                    }
                }
                case AREA -> {
                    polygon(s.points(), -hx, hx, -hy, hy);
                    if (s.envs().isEmpty()) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_AREA_WITHOUT_ENVIRONMENT");
                    }
                }
            }
        }
        TerrainPiece p = id == null ? new TerrainPiece(actor.id()) : piece(id);
        p.update(name, in.category(), in.imageId(), in.widthIn(), in.heightIn(), write(shapes));
        pieces.save(p);
        audit.record(actor.id(), AUDIT, p.getId(), id == null ? "TERRAIN_CREATED" : "TERRAIN_UPDATED", name);
        return view(p);
    }

    @Transactional
    public void retireTerrain(CurrentUser actor, UUID id) {
        requireAdmin(actor);
        TerrainPiece p = piece(id);
        p.setActive(false);
        audit.record(actor.id(), AUDIT, id, "TERRAIN_RETIRED", p.getName());
    }

    // ------------------------------------------------------------------ maps

    /** @param scope OFFICIAL, PUBLIC or MINE; {@code q} matches the map name or the author's name */
    @Transactional(readOnly = true)
    public List<MapSummary> searchMaps(CurrentUser actor, String scope, String q) {
        String sc = scope == null ? "OFFICIAL" : scope.toUpperCase();
        if (!Set.of("OFFICIAL", "PUBLIC", "MINE").contains(sc)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SCOPE");
        }
        String query = q == null ? "" : q.strip().toLowerCase();
        if (query.length() > 60) {
            query = query.substring(0, 60);
        }
        query = query.replace("\\", "").replace("%", "").replace("_", "");
        List<TableMap> found = maps.search(sc, query, actor.id(), PageRequest.of(0, 100));
        Map<UUID, User> authors = users.findAllById(found.stream().map(TableMap::getOwnerId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        Map<UUID, TableBackground> bgs = backgrounds.findAllById(found.stream().map(TableMap::getBackgroundId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(TableBackground::getId, Function.identity()));
        return found.stream().map(m -> summary(actor, m, authors.get(m.getOwnerId()), bgs.get(m.getBackgroundId()))).toList();
    }

    @Transactional(readOnly = true)
    public MapView map(CurrentUser actor, UUID id) {
        return view(actor, visibleMap(actor, id));
    }

    @Transactional
    public MapView saveMap(CurrentUser actor, UUID id, MapInput in) {
        String name = name(in.name());
        if (in.official() && !actor.admin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_OFFICIAL_ADMIN_ONLY");
        }
        TableBackground bg = background(in.backgroundId());
        if (!bg.isActive() && id == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BACKGROUND_RETIRED");
        }
        double depth = in.deploymentDepth() == null ? 8 : in.deploymentDepth();
        if (!between(depth, 2, Math.min(bg.getWidthIn(), bg.getHeightIn()) / 2 - 2)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_DEPLOYMENT");
        }
        List<TerrainShapes.Placement> pl = in.placements() == null ? List.of() : in.placements();
        if (pl.size() > MAX_PLACEMENTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_TOO_MANY_PIECES");
        }
        Map<UUID, TerrainPiece> known = pieces.findAllById(pl.stream().map(p -> uuid(p.assetId())).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(TerrainPiece::getId, Function.identity()));
        for (TerrainShapes.Placement p : pl) {
            TerrainPiece t = known.get(uuid(p.assetId()));
            if (t == null || (!t.isActive() && id == null)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_TERRAIN");
            }
            if (!between(p.x(), 0, bg.getWidthIn()) || !between(p.y(), 0, bg.getHeightIn()) || !between(p.rotation(), -360, 720)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_PLACEMENT");
            }
        }
        TableMap m;
        if (id == null) {
            users.findByIdForUpdate(actor.id());
            if (maps.countByOwnerId(actor.id()) >= MAX_MAPS_PER_USER) {
                throw new ApiException(HttpStatus.CONFLICT, "TABLE_TOO_MANY_MAPS");
            }
            m = new TableMap(actor.id());
        } else {
            m = maps.findById(id).filter(x -> x.getOwnerId().equals(actor.id()) || actor.admin())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_MAP_NOT_FOUND"));
            if (m.isOfficial() && !actor.admin()) {
                throw new ApiException(HttpStatus.FORBIDDEN, "TABLE_OFFICIAL_ADMIN_ONLY");
            }
        }
        m.update(name, bg.getId(), write(pl), depth, in.isPublic() || in.official(), in.official());
        maps.save(m);
        if (in.official()) {
            audit.record(actor.id(), AUDIT, m.getId(), "OFFICIAL_MAP_SAVED", name);
        }
        return view(actor, m);
    }

    @Transactional
    public void deleteMap(CurrentUser actor, UUID id) {
        TableMap m = maps.findById(id).filter(x -> x.getOwnerId().equals(actor.id()) || actor.admin())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_MAP_NOT_FOUND"));
        maps.delete(m); // games keep their own copy of the map
    }

    /** Map visible to the caller: official, public, own, or any for an admin. */
    @Transactional(readOnly = true)
    public TableMap visibleMap(CurrentUser actor, UUID id) {
        return maps.findById(id)
                .filter(m -> m.isOfficial() || m.isPublic() || (actor != null && (actor.admin() || m.getOwnerId().equals(actor.id()))))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_MAP_NOT_FOUND"));
    }

    // ------------------------------------------------------------------ helpers (also used to snapshot maps)

    public BackgroundView view(TableBackground b) {
        return new BackgroundView(b.getId(), b.getName(), b.getImageId(), b.getWidthIn(), b.getHeightIn(),
                read(b.getAreas(), new TypeReference<>() {
                }), b.isActive());
    }

    public TerrainView view(TerrainPiece p) {
        return new TerrainView(p.getId(), p.getName(), p.getCategory(), p.getImageId(), p.getWidthIn(), p.getHeightIn(),
                read(p.getShapes(), new TypeReference<>() {
                }), p.isActive());
    }

    public MapView view(CurrentUser actor, TableMap m) {
        User owner = users.findById(m.getOwnerId()).orElse(null);
        List<TerrainShapes.Placement> pl = read(m.getPlacements(), new TypeReference<>() {
        });
        List<TerrainView> used = pieces.findAllById(pl.stream().map(p -> uuid(p.assetId())).collect(Collectors.toSet()))
                .stream().map(this::view).toList();
        return new MapView(m.getId(), m.getName(), author(owner), m.isOfficial(), m.isPublic(),
                actor != null && m.getOwnerId().equals(actor.id()), view(background(m.getBackgroundId())), pl,
                m.getDeploymentDepth(), used);
    }

    private MapSummary summary(CurrentUser actor, TableMap m, User owner, TableBackground bg) {
        int n = read(m.getPlacements(), new TypeReference<List<TerrainShapes.Placement>>() {
        }).size();
        return new MapSummary(m.getId(), m.getName(), author(owner), m.isOfficial(), m.isPublic(),
                m.getOwnerId().equals(actor.id()), m.getBackgroundId(), bg == null ? null : bg.getImageId(), n, m.getUpdatedAt());
    }

    private static Author author(User u) {
        return u == null ? null : new Author(u.getId(), u.getDisplayName());
    }

    private TableBackground background(UUID id) {
        return backgrounds.findById(id == null ? new UUID(0, 0) : id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_BACKGROUND_NOT_FOUND"));
    }

    private TerrainPiece piece(UUID id) {
        return pieces.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TABLE_TERRAIN_NOT_FOUND"));
    }

    private void imageExists(UUID id) {
        if (id == null || !images.existsById(id)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_IMAGE_NOT_FOUND");
        }
    }

    private static void requireAdmin(CurrentUser actor) {
        if (actor == null || !actor.admin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
    }

    private static String name(String n) {
        String s = n == null ? "" : n.strip();
        if (s.isEmpty() || s.length() > 80) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_NAME");
        }
        return s;
    }

    private static void height(double h) {
        if (!between(h, 0, 20)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_HEIGHT");
        }
    }

    private static void polygon(List<Vec> pts, double x0, double x1, double y0, double y1) {
        points(pts, 3, x0, x1, y0, y1);
    }

    private static void points(List<Vec> pts, int min, double x0, double x1, double y0, double y1) {
        if (pts == null || pts.size() < min || pts.size() > MAX_POINTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SHAPE");
        }
        for (Vec p : pts) {
            if (p == null || !between(p.x(), x0, x1) || !between(p.y(), y0, y1)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_SHAPE");
            }
        }
    }

    static boolean between(double v, double lo, double hi) {
        return Double.isFinite(v) && v >= lo && v <= hi;
    }

    private static UUID uuid(String s) {
        try {
            return UUID.fromString(s);
        } catch (RuntimeException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_UNKNOWN_TERRAIN");
        }
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    public <T> T read(String s, TypeReference<T> type) {
        try {
            return json.readValue(s, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("corrupt table JSON", e);
        }
    }

    private static String sha256(byte[] b) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
