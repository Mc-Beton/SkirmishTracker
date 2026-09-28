package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.Tokens;
import com.skirmishchronicle.config.AppProperties;
import com.skirmishchronicle.identity.domain.OneTimeToken;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.OneTimeTokenRepository;
import com.skirmishchronicle.identity.repo.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final OneTimeTokenRepository oneTimeTokens;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final RefreshTokenService refreshTokens;
    private final MailService mail;
    private final AppProperties props;
    /** Hash of a random password; used to keep login timing equal for unknown e-mails. */
    private final String dummyHash;

    public AuthService(UserRepository users, OneTimeTokenRepository oneTimeTokens, PasswordEncoder passwordEncoder,
                       PasswordPolicy passwordPolicy, RefreshTokenService refreshTokens, MailService mail,
                       AppProperties props) {
        this.users = users;
        this.oneTimeTokens = oneTimeTokens;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.refreshTokens = refreshTokens;
        this.mail = mail;
        this.props = props;
        this.dummyHash = passwordEncoder.encode(Tokens.newToken());
    }

    @Transactional
    public void register(String email, String displayName, String password, String locale) {
        String normalized = User.normalizeEmail(email);
        passwordPolicy.validate(password, normalized, displayName);
        if (users.existsByDisplayNameIgnoreCase(displayName.trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "DISPLAY_NAME_TAKEN");
        }
        Optional<User> existing = users.findByEmailIgnoreCase(normalized);
        if (existing.isPresent()) {
            // Do not reveal that the address is registered: behave as success,
            // re-sending verification only if the account is still unverified.
            if (!existing.get().isEmailVerified()) {
                sendVerification(existing.get());
            }
            return;
        }
        User user = new User(normalized, displayName, locale);
        user.setPasswordHash(passwordEncoder.encode(password));
        users.save(user);
        sendVerification(user);
    }

    @Transactional
    public void resendVerification(String email) {
        users.findByEmailIgnoreCase(email.trim())
                .filter(u -> !u.isEmailVerified())
                .ifPresent(this::sendVerification);
    }

    @Transactional
    public void verifyEmail(String rawToken) {
        User user = consume(rawToken, OneTimeToken.Type.EMAIL_VERIFICATION);
        user.markEmailVerified();
    }

    /** Validates credentials and returns the user; the caller starts the session. */
    @Transactional(noRollbackFor = ApiException.class)
    public User authenticate(String email, String password) {
        Instant now = Instant.now();
        Optional<User> found = users.findByEmailIgnoreCase(email.trim());
        if (found.isEmpty() || !found.get().hasPassword()) {
            passwordEncoder.matches(password, dummyHash);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        User user = found.get();
        if (user.isLocked(now)) {
            throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_TEMPORARILY_LOCKED");
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.registerFailedLogin(props.security().maxFailedLogins(), now.plus(props.security().lockoutDuration()));
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        if (!user.isEmailVerified()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        }
        user.registerSuccessfulLogin();
        if (passwordEncoder.upgradeEncoding(user.getPasswordHash())) {
            user.setPasswordHash(passwordEncoder.encode(password));
        }
        return user;
    }

    @Transactional
    public void forgotPassword(String email) {
        users.findByEmailIgnoreCase(email.trim()).ifPresent(user -> {
            String raw = createToken(user, OneTimeToken.Type.PASSWORD_RESET, props.security().passwordResetTtl());
            mail.sendPasswordReset(user, raw);
        });
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        User user = consume(rawToken, OneTimeToken.Type.PASSWORD_RESET);
        passwordPolicy.validate(newPassword, user.getEmail(), user.getDisplayName());
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        // Reset proves mailbox ownership.
        user.markEmailVerified();
        user.registerSuccessfulLogin();
        refreshTokens.revokeAll(user.getId());
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND"));
        if (user.hasPassword() && !passwordEncoder.matches(currentPassword == null ? "" : currentPassword,
                user.getPasswordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CURRENT_PASSWORD_INVALID");
        }
        passwordPolicy.validate(newPassword, user.getEmail(), user.getDisplayName());
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        refreshTokens.revokeAll(user.getId());
    }

    private void sendVerification(User user) {
        String raw = createToken(user, OneTimeToken.Type.EMAIL_VERIFICATION, props.security().emailTokenTtl());
        mail.sendVerification(user, raw);
    }

    private String createToken(User user, OneTimeToken.Type type, Duration ttl) {
        Instant now = Instant.now();
        oneTimeTokens.invalidateAll(user.getId(), type, now);
        String raw = Tokens.newToken();
        oneTimeTokens.save(new OneTimeToken(user.getId(), type, Tokens.sha256(raw), now.plus(ttl)));
        return raw;
    }

    private User consume(String rawToken, OneTimeToken.Type type) {
        Instant now = Instant.now();
        OneTimeToken token = oneTimeTokens.findByTokenHashAndType(Tokens.sha256(rawToken), type)
                .filter(t -> t.isUsable(now))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "TOKEN_INVALID_OR_EXPIRED"));
        token.markUsed(now);
        return users.findById(token.getUserId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "TOKEN_INVALID_OR_EXPIRED"));
    }
}
