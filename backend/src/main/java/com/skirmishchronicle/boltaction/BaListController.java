package com.skirmishchronicle.boltaction;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Bolt Action lists of a tournament (nation, declarations, pasted text and/or a PDF). */
@RestController
@RequestMapping("/api/tournaments/{id}/ba-lists")
public class BaListController {

    public record ListRequest(@NotBlank @Size(max = 40) String nation,
                              @NotNull @Min(0) @Max(100_000) Integer points,
                              @NotNull @Min(0) @Max(100) Integer orderDice,
                              @NotNull @Min(0) @Max(20) Integer platoons,
                              @Size(max = BaListService.MAX_TEXT) String text) {

        BaListService.SaveInput toInput() {
            return new BaListService.SaveInput(nation, points, orderDice, platoons, text);
        }
    }

    private final BaListService service;

    public BaListController(BaListService service) {
        this.service = service;
    }

    @GetMapping("/me")
    public BaListService.MyList mine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.mine(CurrentUser.from(jwt), id);
    }

    @PutMapping("/me")
    public BaListService.ListView saveMine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                           @Valid @RequestBody ListRequest body) {
        CurrentUser actor = CurrentUser.from(jwt);
        return service.save(actor, id, actor.id(), body.toInput());
    }

    /** Raw PDF in the body (up to 5 MB); recognised by its signature. {@code name}: original file name. */
    @PutMapping("/me/pdf")
    public BaListService.ListView uploadMine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt,
                                             @RequestParam(required = false) String name,
                                             HttpServletRequest request) throws IOException {
        CurrentUser actor = CurrentUser.from(jwt);
        return service.uploadPdf(actor, id, actor.id(), name, body(request));
    }

    @DeleteMapping("/me/pdf")
    public BaListService.ListView deleteMine(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        CurrentUser actor = CurrentUser.from(jwt);
        return service.deletePdf(actor, id, actor.id());
    }

    @GetMapping
    public List<BaListService.Summary> list(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.list(CurrentUser.from(jwt), id);
    }

    @GetMapping("/{userId}")
    public BaListService.ListView get(@PathVariable UUID id, @PathVariable UUID userId,
                                      @AuthenticationPrincipal Jwt jwt) {
        return service.get(CurrentUser.from(jwt), id, userId);
    }

    /** Download only (never rendered inline by the app's origin), not cached by shared caches. */
    @GetMapping("/{userId}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id, @PathVariable UUID userId,
                                      @AuthenticationPrincipal Jwt jwt) {
        BaListService.Pdf pdf = service.pdf(CurrentUser.from(jwt), id, userId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(pdf.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox; default-src 'none'")
                .body(pdf.bytes());
    }

    /** Organizer correction of a player's list. */
    @PutMapping("/{userId}")
    public BaListService.ListView save(@PathVariable UUID id, @PathVariable UUID userId,
                                       @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ListRequest body) {
        return service.save(CurrentUser.from(jwt), id, userId, body.toInput());
    }

    @PutMapping("/{userId}/pdf")
    public BaListService.ListView upload(@PathVariable UUID id, @PathVariable UUID userId,
                                         @AuthenticationPrincipal Jwt jwt,
                                         @RequestParam(required = false) String name,
                                         HttpServletRequest request) throws IOException {
        return service.uploadPdf(CurrentUser.from(jwt), id, userId, name, body(request));
    }

    @DeleteMapping("/{userId}/pdf")
    public BaListService.ListView delete(@PathVariable UUID id, @PathVariable UUID userId,
                                         @AuthenticationPrincipal Jwt jwt) {
        return service.deletePdf(CurrentUser.from(jwt), id, userId);
    }

    private static byte[] body(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > BaListService.MAX_PDF_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "PDF_TOO_LARGE");
        }
        byte[] bytes;
        try (InputStream in = request.getInputStream()) {
            bytes = in.readNBytes(BaListService.MAX_PDF_BYTES + 1);
        }
        if (bytes.length > BaListService.MAX_PDF_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "PDF_TOO_LARGE");
        }
        return bytes;
    }
}
