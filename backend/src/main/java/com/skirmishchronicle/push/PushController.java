package com.skirmishchronicle.push;

import com.skirmishchronicle.common.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Web Push subscriptions of the signed-in user. */
@RestController
public class PushController {

    public record Keys(@NotBlank @Size(max = 200) String p256dh, @NotBlank @Size(max = 100) String auth) {
    }

    public record SubscribeRequest(@NotBlank @Size(max = 1000) String endpoint, @NotNull @Valid Keys keys) {
    }

    public record UnsubscribeRequest(@NotBlank @Size(max = 1000) String endpoint) {
    }

    private final PushService push;

    public PushController(PushService push) {
        this.push = push;
    }

    @GetMapping("/api/push/key")
    public Map<String, Object> key(@AuthenticationPrincipal Jwt jwt) {
        return Map.of("publicKey", push.publicKey(), "devices", push.devices(CurrentUser.from(jwt)));
    }

    @PostMapping("/api/push/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void subscribe(@Valid @RequestBody SubscribeRequest body, @AuthenticationPrincipal Jwt jwt,
                          @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        push.subscribe(CurrentUser.from(jwt), body.endpoint(), body.keys().p256dh(), body.keys().auth(), userAgent);
    }

    @DeleteMapping("/api/push/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsubscribe(@Valid @RequestBody UnsubscribeRequest body, @AuthenticationPrincipal Jwt jwt) {
        push.unsubscribe(CurrentUser.from(jwt), body.endpoint());
    }

    @PostMapping("/api/push/test")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void test(@AuthenticationPrincipal Jwt jwt) {
        push.test(CurrentUser.from(jwt));
    }
}
