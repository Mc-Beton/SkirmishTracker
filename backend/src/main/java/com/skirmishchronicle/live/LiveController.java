package com.skirmishchronicle.live;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * {@code GET /api/live?t=<tournamentId>} – Server-Sent Events with change hints for up to 5 tournaments and,
 * for a signed-in caller, their own notification inbox. Public: anonymous visitors get tournament hints only.
 */
@RestController
public class LiveController {

    private final LiveEventService live;

    public LiveController(LiveEventService live) {
        this.live = live;
    }

    @GetMapping(path = "/api/live", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam(name = "t", required = false) List<UUID> tournaments,
                             @AuthenticationPrincipal Jwt jwt,
                             HttpServletRequest request,
                             HttpServletResponse response) {
        CurrentUser user = CurrentUser.from(jwt);
        // no-transform stops gzip in a proxy (e.g. the Next.js server) from buffering the stream;
        // X-Accel-Buffering does the same for nginx.
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        String clientKey = user != null ? "u:" + user.id() : "ip:" + request.getRemoteAddr();
        return live.open(user != null ? user.id() : null, tournaments == null ? List.of() : tournaments, clientKey);
    }
}
