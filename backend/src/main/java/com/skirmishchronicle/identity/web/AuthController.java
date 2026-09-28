package com.skirmishchronicle.identity.web;

import com.skirmishchronicle.identity.service.AuthService;
import com.skirmishchronicle.identity.service.RefreshTokenService;
import com.skirmishchronicle.identity.web.AuthDtos.EmailRequest;
import com.skirmishchronicle.identity.web.AuthDtos.LoginRequest;
import com.skirmishchronicle.identity.web.AuthDtos.RegisterRequest;
import com.skirmishchronicle.identity.web.AuthDtos.ResetPasswordRequest;
import com.skirmishchronicle.identity.web.AuthDtos.TokenRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final SessionService sessions;
    private final RefreshTokenService refreshTokens;
    private final SessionCookies cookies;

    public AuthController(AuthService authService, SessionService sessions, RefreshTokenService refreshTokens,
                          SessionCookies cookies) {
        this.authService = authService;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.cookies = cookies;
    }

    /** Makes Spring write the XSRF-TOKEN cookie; the SPA echoes it in the X-XSRF-TOKEN header. */
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void register(@Valid @RequestBody RegisterRequest body) {
        authService.register(body.email(), body.displayName(), body.password(),
                body.locale() == null ? "pl" : body.locale());
    }

    @PostMapping("/verify-email")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verifyEmail(@Valid @RequestBody TokenRequest body) {
        authService.verifyEmail(body.token());
    }

    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendVerification(@Valid @RequestBody EmailRequest body) {
        authService.resendVerification(body.email());
    }

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void login(@Valid @RequestBody LoginRequest body, HttpServletRequest request,
                      HttpServletResponse response) {
        sessions.start(authService.authenticate(body.email(), body.password()), request, response);
    }

    @PostMapping("/refresh")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void refresh(HttpServletRequest request, HttpServletResponse response) {
        sessions.refresh(request, response);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response) {
        sessions.end(request, response);
    }

    @PostMapping("/logout-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logoutAll(@AuthenticationPrincipal Jwt jwt, HttpServletResponse response) {
        refreshTokens.revokeAll(UUID.fromString(jwt.getSubject()));
        cookies.clear(response);
    }

    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@Valid @RequestBody EmailRequest body) {
        authService.forgotPassword(body.email());
    }

    @PostMapping("/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest body, HttpServletResponse response) {
        authService.resetPassword(body.token(), body.newPassword());
        cookies.clear(response);
    }
}
