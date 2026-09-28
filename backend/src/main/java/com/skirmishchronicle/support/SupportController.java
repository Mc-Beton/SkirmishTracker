package com.skirmishchronicle.support;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /api/support} – public contact form (rate limited per IP, see RateLimitFilter). */
@RestController
public class SupportController {

    public record SupportRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @Size(max = 80) String name,
            @NotNull SupportMessage.Topic topic,
            @NotBlank @Size(min = 10, max = 5000) String message,
            @Pattern(regexp = "^(pl|en)$") String locale,
            /** Honeypot: hidden in the form, so only bots fill it in. */
            @Size(max = 200) String website) {
    }

    private final SupportService support;

    public SupportController(SupportService support) {
        this.support = support;
    }

    @PostMapping("/api/support")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void submit(@Valid @RequestBody SupportRequest body, @AuthenticationPrincipal Jwt jwt) {
        if (body.website() != null && !body.website().isBlank()) {
            return;  // looks successful to the bot, nothing is stored or sent
        }
        support.submit(CurrentUser.from(jwt), body.email(), body.name(), body.topic(), body.message(), body.locale());
    }
}
