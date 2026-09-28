package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.domain.UserIdentity;
import com.skirmishchronicle.identity.repo.UserIdentityRepository;
import com.skirmishchronicle.identity.repo.UserRepository;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Finds or creates the local user for a Google / Discord login. */
@Service
public class ExternalAccountService {

    public record ExternalProfile(String provider, String subject, String email, boolean emailVerified,
                                  String name, String locale) {
    }

    private final UserRepository users;
    private final UserIdentityRepository identities;

    public ExternalAccountService(UserRepository users, UserIdentityRepository identities) {
        this.users = users;
        this.identities = identities;
    }

    @Transactional
    public User resolve(ExternalProfile profile) {
        Optional<UserIdentity> linked = identities.findByProviderAndSubject(profile.provider(), profile.subject());
        if (linked.isPresent()) {
            return users.findById(linked.get().getUserId())
                    .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "OAUTH_ACCOUNT_MISSING"));
        }
        if (profile.email() == null || !profile.emailVerified()) {
            // Linking by an unverified address would allow account takeover.
            throw new ApiException(HttpStatus.FORBIDDEN, "OAUTH_EMAIL_NOT_VERIFIED");
        }
        User user = users.findByEmailIgnoreCase(profile.email()).orElseGet(() -> {
            User created = new User(profile.email(), uniqueDisplayName(profile.name()), profile.locale());
            return users.save(created);
        });
        if (!user.isEmailVerified() && user.hasPassword()) {
            // Pre-hijacking defence: someone may have registered this address with their own password
            // without ever verifying it. The provider proves ownership, so that password is discarded.
            user.setPasswordHash(null);
        }
        user.markEmailVerified();
        identities.save(new UserIdentity(user.getId(), profile.provider(), profile.subject()));
        return user;
    }

    private String uniqueDisplayName(String name) {
        String base = (name == null || name.isBlank()) ? "Player" : name.trim();
        base = base.replaceAll("[^\\p{L}\\p{N} _.-]", "");
        if (base.length() < 3) {
            base = "Player";
        }
        if (base.length() > 32) {
            base = base.substring(0, 32);
        }
        String candidate = base;
        while (users.existsByDisplayNameIgnoreCase(candidate)) {
            candidate = base + ThreadLocalRandom.current().nextInt(1000, 9999);
        }
        return candidate;
    }

    public static String normalizeLocale(String locale) {
        if (locale == null) {
            return "pl";
        }
        return locale.toLowerCase(Locale.ROOT).startsWith("pl") ? "pl" : "en";
    }
}
