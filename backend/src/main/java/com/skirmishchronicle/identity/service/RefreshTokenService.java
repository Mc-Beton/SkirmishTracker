package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.Tokens;
import com.skirmishchronicle.config.AppProperties;
import com.skirmishchronicle.identity.domain.RefreshToken;
import com.skirmishchronicle.identity.repo.RefreshTokenRepository;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Rotating refresh tokens with reuse detection: every refresh revokes the presented token and issues a
 * new one in the same family. Presenting an already-revoked token means it was stolen or replayed, so
 * the whole family (that login session) is revoked.
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    public record Issued(String rawToken, UUID userId) {
    }

    private final RefreshTokenRepository repository;
    private final AppProperties props;

    public RefreshTokenService(RefreshTokenRepository repository, AppProperties props) {
        this.repository = repository;
        this.props = props;
    }

    @Transactional
    public Issued issue(UUID userId, String userAgent, String ip) {
        return issueInFamily(userId, UUID.randomUUID(), userAgent, ip);
    }

    private Issued issueInFamily(UUID userId, UUID familyId, String userAgent, String ip) {
        String raw = Tokens.newToken();
        Instant expires = Instant.now().plus(props.security().refreshTokenTtl());
        repository.save(new RefreshToken(userId, Tokens.sha256(raw), familyId, expires, userAgent, ip));
        return new Issued(raw, userId);
    }

    // noRollbackFor: revoking a family on reuse must be committed even though we then reject the call.
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawToken, String userAgent, String ip) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_MISSING");
        }
        Instant now = Instant.now();
        RefreshToken token = repository.findByTokenHash(Tokens.sha256(rawToken))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_INVALID"));
        if (token.getRevokedAt() != null) {
            log.warn("Refresh token reuse detected for user {}; revoking session family", token.getUserId());
            repository.revokeFamily(token.getFamilyId(), now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_REUSED");
        }
        if (!token.isActive(now)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_EXPIRED");
        }
        token.revoke(now);
        return issueInFamily(token.getUserId(), token.getFamilyId(), userAgent, ip);
    }

    @Transactional
    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        repository.findByTokenHash(Tokens.sha256(rawToken))
                .ifPresent(t -> repository.revokeFamily(t.getFamilyId(), Instant.now()));
    }

    @Transactional
    public void revokeAll(UUID userId) {
        repository.revokeAllForUser(userId, Instant.now());
    }
}
