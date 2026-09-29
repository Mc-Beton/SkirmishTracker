package com.skirmishchronicle.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.repo.UserRepository;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Web Push: stores browser subscriptions and delivers notifications to them after the notifying transaction
 * commits, in the background. Only endpoints of known push services are accepted (the server POSTs to them,
 * so an arbitrary URL would be a server-side request forgery vector). Endpoints are secrets and never logged.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    /** Push services of Chrome/Edge/Android (FCM), Firefox, Safari/iOS and legacy Edge (WNS). */
    private static final List<String> ALLOWED_HOSTS = List.of("fcm.googleapis.com", "android.googleapis.com",
            "updates.push.services.mozilla.com", "push.services.mozilla.com", ".push.apple.com",
            ".notify.windows.com");
    private static final int MAX_PER_USER = 10;
    private static final Set<String> URGENT = Set.of("ROUND_STARTED", "TIME_UP", "JUDGE_CALL", "RESULT_TO_CONFIRM",
            "LINEUP_REQUIRED");

    private record VapidKeys(ECPrivateKey privateKey, byte[] publicRaw) {
    }

    private final PushProperties props;
    private final PushSubscriptionRepository subscriptions;
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private volatile VapidKeys keys;

    public PushService(PushProperties props, PushSubscriptionRepository subscriptions, UserRepository users,
                       JdbcTemplate jdbc, ObjectMapper mapper) {
        this.props = props;
        this.subscriptions = subscriptions;
        this.users = users;
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }

    // ------------------------------------------------------------------ API

    public String publicKey() {
        if (!props.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PUSH_DISABLED");
        }
        return WebPushCrypto.b64(keys().publicRaw());
    }

    public void subscribe(CurrentUser actor, String endpoint, String p256dh, String auth, String userAgent) {
        if (!props.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PUSH_DISABLED");
        }
        if (!allowedEndpoint(endpoint) || !validKeys(p256dh, auth)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PUSH_SUBSCRIPTION");
        }
        String agent = userAgent == null ? null : userAgent.substring(0, Math.min(255, userAgent.length()));
        PushSubscription s = subscriptions.findByEndpoint(endpoint).orElse(null);
        if (s == null) {
            subscriptions.save(new PushSubscription(actor.id(), endpoint, p256dh, auth, agent));
        } else {
            // The same browser signed in as someone else: the subscription now belongs to the new user.
            s.update(actor.id(), p256dh, auth, agent);
            subscriptions.save(s);
        }
        List<PushSubscription> mine = subscriptions.findByUserIdOrderByCreatedAtAsc(actor.id());
        for (int i = 0; i < mine.size() - MAX_PER_USER; i++) {
            subscriptions.delete(mine.get(i));
        }
    }

    public void unsubscribe(CurrentUser actor, String endpoint) {
        if (endpoint != null) {
            subscriptions.deleteByEndpointAndUserId(endpoint, actor.id());
        }
    }

    public int devices(CurrentUser actor) {
        return subscriptions.findByUserIdOrderByCreatedAtAsc(actor.id()).size();
    }

    /** Sends a test notification to all of the caller's devices (now, not after a transaction). */
    public void test(CurrentUser actor) {
        send(actor.id(), "TEST", Map.of(), "/account");
    }

    /** Pushes a notification to the user's devices once the current transaction (if any) has committed. */
    public void sendAfterCommit(UUID userId, String type, Map<String, ?> params, String link) {
        if (!props.enabled() || userId == null) {
            return;
        }
        Runnable task = () -> send(userId, type, params, link);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    // ------------------------------------------------------------------ delivery

    private void send(UUID userId, String type, Map<String, ?> params, String link) {
        executor.execute(() -> {
            try {
                deliver(userId, type, params, link);
            } catch (RuntimeException e) {
                log.warn("Push delivery failed for a {} notification: {}", type, e.getClass().getSimpleName());
            }
        });
    }

    private void deliver(UUID userId, String type, Map<String, ?> params, String link) {
        List<PushSubscription> targets = subscriptions.findByUserIdOrderByCreatedAtAsc(userId);
        if (targets.isEmpty()) {
            return;
        }
        String locale = users.findById(userId).map(u -> u.getLocale()).orElse("pl");
        ObjectNode payload = mapper.createObjectNode();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("type", type);
        payload.set("params", mapper.valueToTree(params == null ? Map.of() : params));
        payload.put("link", link);
        payload.put("locale", locale);
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        VapidKeys vapid = keys();
        for (PushSubscription s : targets) {
            String host = URI.create(s.getEndpoint()).getHost();
            try {
                byte[] encrypted = WebPushCrypto.encrypt(body, WebPushCrypto.unb64(s.getP256dh()),
                        WebPushCrypto.unb64(s.getAuth()));
                URI endpoint = URI.create(s.getEndpoint());
                String audience = endpoint.getScheme() + "://" + endpoint.getHost();
                HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(15))
                        .header("Content-Encoding", "aes128gcm")
                        .header("Content-Type", "application/octet-stream")
                        .header("TTL", "86400")
                        .header("Urgency", URGENT.contains(type) ? "high" : "normal")
                        .header("Authorization", WebPushCrypto.vapidAuthorization(audience, props.subject(),
                                vapid.privateKey(), vapid.publicRaw(), Instant.now().plusSeconds(12 * 3600).getEpochSecond()))
                        .POST(HttpRequest.BodyPublishers.ofByteArray(encrypted)).build();
                HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
                int status = response.statusCode();
                if (status == 404 || status == 410) {
                    subscriptions.deleteByEndpoint(s.getEndpoint()); // expired or unsubscribed in the browser
                } else if (status >= 200 && status < 300) {
                    s.delivered();
                    subscriptions.save(s);
                } else {
                    log.warn("Push service {} answered {}", host, status);
                }
            } catch (GeneralSecurityException e) {
                log.warn("Push encryption failed for a subscription at {}: {}", host, e.getMessage());
            } catch (java.io.IOException e) {
                log.warn("Push service {} unreachable: {}", host, e.getClass().getSimpleName());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    // ------------------------------------------------------------------ validation & keys

    static boolean allowedEndpoint(String endpoint) {
        if (endpoint == null || endpoint.length() > 1000) {
            return false;
        }
        try {
            URI uri = new URI(endpoint);
            String host = uri.getHost();
            if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) {
                return false;
            }
            String h = host.toLowerCase(Locale.ROOT);
            return ALLOWED_HOSTS.stream().anyMatch(a -> a.startsWith(".") ? h.endsWith(a) && h.length() > a.length()
                    : h.equals(a));
        } catch (java.net.URISyntaxException e) {
            return false;
        }
    }

    static boolean validKeys(String p256dh, String auth) {
        try {
            byte[] pub = WebPushCrypto.unb64(p256dh == null ? "" : p256dh);
            byte[] secret = WebPushCrypto.unb64(auth == null ? "" : auth);
            if (pub.length != 65 || pub[0] != 0x04 || secret.length != 16) {
                return false;
            }
            WebPushCrypto.publicKey(pub); // a point on P-256
            return true;
        } catch (IllegalArgumentException | GeneralSecurityException e) {
            return false;
        }
    }

    private VapidKeys keys() {
        VapidKeys k = keys;
        if (k == null) {
            synchronized (this) {
                if (keys == null) {
                    keys = loadKeys();
                }
                k = keys;
            }
        }
        return k;
    }

    private VapidKeys loadKeys() {
        try {
            if (props.publicKey() != null && !props.publicKey().isBlank() && props.privateKey() != null
                    && !props.privateKey().isBlank()) {
                return new VapidKeys(WebPushCrypto.privateKey(WebPushCrypto.unb64(props.privateKey().strip())),
                        WebPushCrypto.unb64(props.publicKey().strip()));
            }
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT public_key, private_key FROM push_keys WHERE id = 1");
            if (rows.isEmpty()) {
                KeyPair pair = WebPushCrypto.generateKeyPair();
                jdbc.update("INSERT INTO push_keys (id, public_key, private_key, created_at) VALUES (1, ?, ?, now()) "
                                + "ON CONFLICT (id) DO NOTHING",
                        WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) pair.getPublic())),
                        WebPushCrypto.b64(WebPushCrypto.rawPrivate((ECPrivateKey) pair.getPrivate())));
                log.info("Generated a VAPID key pair for Web Push (stored in the database)");
                rows = jdbc.queryForList("SELECT public_key, private_key FROM push_keys WHERE id = 1");
            }
            Map<String, Object> row = rows.get(0);
            return new VapidKeys(WebPushCrypto.privateKey(WebPushCrypto.unb64((String) row.get("private_key"))),
                    WebPushCrypto.unb64((String) row.get("public_key")));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Invalid VAPID keys", e);
        }
    }
}
