package com.skirmishchronicle.identity.web;

import com.skirmishchronicle.config.AppProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Auth cookies: HttpOnly (not readable by JS, mitigates XSS token theft), SameSite=Lax, Secure in prod.
 * The refresh cookie is scoped to /api/auth so it is only sent to refresh/logout endpoints.
 */
@Component
public class SessionCookies {

    public static final String ACCESS_COOKIE = "sc_at";
    public static final String REFRESH_COOKIE = "sc_rt";

    private final AppProperties props;

    public SessionCookies(AppProperties props) {
        this.props = props;
    }

    public void writeAccess(HttpServletResponse response, String token) {
        add(response, ACCESS_COOKIE, token, "/", props.security().accessTokenTtl());
    }

    public void writeRefresh(HttpServletResponse response, String token) {
        add(response, REFRESH_COOKIE, token, "/api/auth", props.security().refreshTokenTtl());
    }

    public void clear(HttpServletResponse response) {
        add(response, ACCESS_COOKIE, "", "/", Duration.ZERO);
        add(response, REFRESH_COOKIE, "", "/api/auth", Duration.ZERO);
    }

    public String readRefresh(HttpServletRequest request) {
        return read(request, REFRESH_COOKIE);
    }

    public static String read(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private void add(HttpServletResponse response, String name, String value, String path, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(props.security().secureCookies())
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
