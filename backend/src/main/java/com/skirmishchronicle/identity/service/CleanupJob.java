package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.identity.repo.OneTimeTokenRepository;
import com.skirmishchronicle.identity.repo.RefreshTokenRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Removes expired tokens daily (data minimisation). */
@Component
public class CleanupJob {

    private final RefreshTokenRepository refreshTokens;
    private final OneTimeTokenRepository oneTimeTokens;

    public CleanupJob(RefreshTokenRepository refreshTokens, OneTimeTokenRepository oneTimeTokens) {
        this.refreshTokens = refreshTokens;
        this.oneTimeTokens = oneTimeTokens;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpired() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(7));
        refreshTokens.deleteExpiredBefore(cutoff);
        oneTimeTokens.deleteExpiredBefore(cutoff);
    }
}
