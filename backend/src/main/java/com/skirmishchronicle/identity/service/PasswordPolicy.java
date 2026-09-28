package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.common.ApiException;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Password rules following OWASP ASVS / NIST 800-63B: length over complexity, no composition rules,
 * reject obvious and context-specific passwords. Breached-password (HIBP) check is a planned addition.
 */
@Component
public class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = Set.of(
            "123456789012", "password1234", "qwertyuiop12", "111111111111", "aaaaaaaaaaaa",
            "passwordpassword", "iloveyou1234", "zaq12wsxcde3", "haslo1234567", "eldfallchronicles",
            "skirmishchronicle", "warbracket", "1234567890qwerty", "qwerty123456");

    public void validate(String password, String email, String displayName) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_SHORT");
        }
        if (password.length() > MAX_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_LONG");
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower) || password.chars().distinct().count() < 4) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_COMMON");
        }
        if (email != null) {
            String localPart = email.toLowerCase(Locale.ROOT).split("@")[0];
            if (localPart.length() >= 4 && lower.contains(localPart)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_CONTAINS_PERSONAL_DATA");
            }
        }
        if (displayName != null && displayName.length() >= 4
                && lower.contains(displayName.toLowerCase(Locale.ROOT))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_CONTAINS_PERSONAL_DATA");
        }
    }
}
