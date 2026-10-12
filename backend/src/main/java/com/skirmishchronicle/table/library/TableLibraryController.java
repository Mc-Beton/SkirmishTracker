package com.skirmishchronicle.table.library;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
 * Library for the online table. Admin endpoints live under /api/admin (role ADMIN in SecurityConfig, checked
 * again in the service); pictures are public (library art only), everything else needs a signed-in user.
 */
@RestController
public class TableLibraryController {

    private final TableLibraryService library;

    public TableLibraryController(TableLibraryService library) {
        this.library = library;
    }

    // ---------------------------------------------------------------- images

    /** Raw picture in the body (PNG, JPEG or WebP, up to 8 MB); the type is detected from the bytes. */
    @PostMapping(path = "/api/admin/table/images")
    @ResponseStatus(HttpStatus.CREATED)
    public TableLibraryService.ImageView upload(@AuthenticationPrincipal Jwt jwt, HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > ImageCheck.MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "TABLE_IMAGE_TOO_LARGE");
        }
        byte[] bytes;
        try (InputStream in = request.getInputStream()) {
            bytes = in.readNBytes(ImageCheck.MAX_BYTES + 1);
        }
        if (bytes.length > ImageCheck.MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "TABLE_IMAGE_TOO_LARGE");
        }
        return library.upload(CurrentUser.from(jwt), bytes);
    }

    @GetMapping("/api/table/images/{id}")
    public ResponseEntity<byte[]> image(@PathVariable UUID id) {
        TableImage img = library.image(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(img.getContentType()))
                // images never change (a new upload gets a new id)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .eTag('"' + img.getSha256() + '"')
                .header("Content-Disposition", "inline")
                .body(img.getBytes());
    }

    // ---------------------------------------------------------------- backgrounds

    @GetMapping("/api/table/backgrounds")
    public List<TableLibraryService.BackgroundView> backgrounds() {
        return library.backgrounds();
    }

    @PostMapping("/api/admin/table/backgrounds")
    @ResponseStatus(HttpStatus.CREATED)
    public TableLibraryService.BackgroundView createBackground(@AuthenticationPrincipal Jwt jwt,
                                                               @RequestBody TableLibraryService.BackgroundInput body) {
        return library.saveBackground(CurrentUser.from(jwt), null, body);
    }

    @PutMapping("/api/admin/table/backgrounds/{id}")
    public TableLibraryService.BackgroundView updateBackground(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                                               @RequestBody TableLibraryService.BackgroundInput body) {
        return library.saveBackground(CurrentUser.from(jwt), id, body);
    }

    @DeleteMapping("/api/admin/table/backgrounds/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void retireBackground(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        library.retireBackground(CurrentUser.from(jwt), id);
    }

    // ---------------------------------------------------------------- terrain pieces

    @GetMapping("/api/table/terrain")
    public List<TableLibraryService.TerrainView> terrain() {
        return library.terrain();
    }

    @PostMapping("/api/admin/table/terrain")
    @ResponseStatus(HttpStatus.CREATED)
    public TableLibraryService.TerrainView createTerrain(@AuthenticationPrincipal Jwt jwt,
                                                         @RequestBody TableLibraryService.TerrainInput body) {
        return library.saveTerrain(CurrentUser.from(jwt), null, body);
    }

    @PutMapping("/api/admin/table/terrain/{id}")
    public TableLibraryService.TerrainView updateTerrain(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                                         @RequestBody TableLibraryService.TerrainInput body) {
        return library.saveTerrain(CurrentUser.from(jwt), id, body);
    }

    @DeleteMapping("/api/admin/table/terrain/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void retireTerrain(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        library.retireTerrain(CurrentUser.from(jwt), id);
    }

    // ---------------------------------------------------------------- maps

    @GetMapping("/api/table/maps")
    public List<TableLibraryService.MapSummary> maps(@AuthenticationPrincipal Jwt jwt,
                                                     @RequestParam(defaultValue = "OFFICIAL") String scope,
                                                     @RequestParam(required = false) String q) {
        return library.searchMaps(CurrentUser.from(jwt), scope, q);
    }

    @GetMapping("/api/table/maps/{id}")
    public TableLibraryService.MapView map(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return library.map(CurrentUser.from(jwt), id);
    }

    @PostMapping("/api/table/maps")
    @ResponseStatus(HttpStatus.CREATED)
    public TableLibraryService.MapView createMap(@AuthenticationPrincipal Jwt jwt,
                                                 @RequestBody TableLibraryService.MapInput body) {
        return library.saveMap(CurrentUser.from(jwt), null, body);
    }

    @PutMapping("/api/table/maps/{id}")
    public TableLibraryService.MapView updateMap(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                                 @RequestBody TableLibraryService.MapInput body) {
        return library.saveMap(CurrentUser.from(jwt), id, body);
    }

    @DeleteMapping("/api/table/maps/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMap(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        library.deleteMap(CurrentUser.from(jwt), id);
    }
}
