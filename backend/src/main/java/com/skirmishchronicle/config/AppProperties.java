package com.skirmishchronicle.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
/** {@code supportInbox}: where contact-form messages are forwarded (empty = only stored in the database). */
public record AppProperties(String frontendUrl, String mailFrom, String supportInbox, Security security) {

    public record Security(
            String jwtSecret,
            Duration accessTokenTtl,
            Duration refreshTokenTtl,
            Duration emailTokenTtl,
            Duration passwordResetTtl,
            boolean secureCookies,
            int maxFailedLogins,
            Duration lockoutDuration,
            int authRateLimitPerMinute) {
    }
}
