package com.skirmishchronicle.identity.web;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.identity.service.AuthService;
import com.skirmishchronicle.identity.web.AuthDtos.ChangePasswordRequest;
import com.skirmishchronicle.identity.web.AuthDtos.MeResponse;
import com.skirmishchronicle.identity.web.AuthDtos.UpdateProfileRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
public class MeController {

    private final UserRepository users;
    private final AuthService authService;
    private final SessionCookies cookies;

    public MeController(UserRepository users, AuthService authService, SessionCookies cookies) {
        this.users = users;
        this.authService = authService;
        this.cookies = cookies;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return toResponse(load(jwt));
    }

    @PatchMapping
    @Transactional
    public MeResponse update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest body) {
        User user = load(jwt);
        if (body.displayName() != null && !body.displayName().trim().equalsIgnoreCase(user.getDisplayName())) {
            if (users.existsByDisplayNameIgnoreCase(body.displayName().trim())) {
                throw new ApiException(HttpStatus.CONFLICT, "DISPLAY_NAME_TAKEN");
            }
            user.setDisplayName(body.displayName());
        }
        if (body.locale() != null) {
            user.setLocale(body.locale());
        }
        // Club and city are always sent by the profile form; empty clears them.
        user.setClub(body.club());
        user.setHomeCity(body.homeCity());
        if (body.confirmResults() != null) {
            user.setConfirmResults(body.confirmResults());
        }
        return toResponse(user);
    }

    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest body,
                               HttpServletResponse response) {
        authService.changePassword(UUID.fromString(jwt.getSubject()), body.currentPassword(), body.newPassword());
        // All sessions were revoked; the user signs in again with the new password.
        cookies.clear(response);
    }

    private User load(Jwt jwt) {
        return users.findById(UUID.fromString(jwt.getSubject()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "USER_NOT_FOUND"));
    }

    private static MeResponse toResponse(User user) {
        return new MeResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getLocale(),
                user.getClub(), user.getHomeCity(), user.getRoles().stream().map(Enum::name).sorted().toList(), user.hasPassword(),
                user.getCreatedAt(), user.isConfirmResults());
    }
}
