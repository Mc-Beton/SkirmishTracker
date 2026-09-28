package com.skirmishchronicle.common;

import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** The authenticated caller, derived from the access token. Null-safe for anonymous requests. */
public record CurrentUser(UUID id, boolean admin) {

    public static CurrentUser from(Jwt jwt) {
        if (jwt == null) {
            return null;
        }
        List<String> roles = jwt.getClaimAsStringList("roles");
        return new CurrentUser(UUID.fromString(jwt.getSubject()), roles != null && roles.contains("ADMIN"));
    }
}
