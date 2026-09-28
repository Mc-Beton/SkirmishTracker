package com.skirmishchronicle.identity.web;

import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.identity.service.JwtService;
import com.skirmishchronicle.identity.service.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

/** Starts, refreshes and ends browser sessions (access + refresh cookies). */
@Service
public class SessionService {

    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final SessionCookies cookies;
    private final UserRepository users;

    public SessionService(JwtService jwtService, RefreshTokenService refreshTokens, SessionCookies cookies,
                          UserRepository users) {
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.cookies = cookies;
        this.users = users;
    }

    public void start(User user, HttpServletRequest request, HttpServletResponse response) {
        RefreshTokenService.Issued refresh = refreshTokens.issue(user.getId(), userAgent(request),
                request.getRemoteAddr());
        cookies.writeAccess(response, jwtService.issueAccessToken(user));
        cookies.writeRefresh(response, refresh.rawToken());
    }

    public void refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
            RefreshTokenService.Issued refresh = refreshTokens.rotate(cookies.readRefresh(request),
                    userAgent(request), request.getRemoteAddr());
            User user = users.findById(refresh.userId()).orElseThrow();
            cookies.writeAccess(response, jwtService.issueAccessToken(user));
            cookies.writeRefresh(response, refresh.rawToken());
        } catch (RuntimeException e) {
            cookies.clear(response);
            throw e;
        }
    }

    public void end(HttpServletRequest request, HttpServletResponse response) {
        refreshTokens.revoke(cookies.readRefresh(request));
        cookies.clear(response);
    }

    private static String userAgent(HttpServletRequest request) {
        return request.getHeader(HttpHeaders.USER_AGENT);
    }
}
