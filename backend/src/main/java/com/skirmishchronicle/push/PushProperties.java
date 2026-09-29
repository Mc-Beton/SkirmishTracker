package com.skirmishchronicle.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Web Push settings. {@code subject}: contact for push services (mailto: or https:). Keys: base64url raw P-256
 * (65-byte public point, 32-byte private scalar); empty = generated once and stored in the database.
 */
@ConfigurationProperties(prefix = "app.push")
public record PushProperties(boolean enabled, String subject, String publicKey, String privateKey) {
}
