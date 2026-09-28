package com.skirmishchronicle.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String frontendUrl, String mailFrom, Security security) {

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
