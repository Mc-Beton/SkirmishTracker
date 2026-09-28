package com.skirmishchronicle.live;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * After every successful change under {@code /api/tournaments/{id}/...} tells live clients watching that tournament
 * to refresh. Runs after the controller returned, i.e. after the service transaction committed.
 */
@Component
public class TournamentChangeInterceptor implements HandlerInterceptor {

    private static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Pattern TOURNAMENT = Pattern.compile("^/api/tournaments/([0-9a-fA-F-]{36})(?:/.*)?$");

    private final LiveEventService live;

    public TournamentChangeInterceptor(LiveEventService live) {
        this.live = live;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
                                Exception ex) {
        if (ex != null || response.getStatus() >= 400 || !MUTATING.contains(request.getMethod())) {
            return;
        }
        UUID id = tournamentId(request.getRequestURI());
        if (id != null) {
            live.tournamentChanged(id, "changed");
        }
    }

    static UUID tournamentId(String uri) {
        Matcher m = TOURNAMENT.matcher(uri);
        if (!m.matches()) {
            return null;
        }
        try {
            return UUID.fromString(m.group(1));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
