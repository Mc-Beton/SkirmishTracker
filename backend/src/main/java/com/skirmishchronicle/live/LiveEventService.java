package com.skirmishchronicle.live;

import com.skirmishchronicle.common.ApiException;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live change hints over Server-Sent Events.
 *
 * <p>Events carry only "what changed" (a tournament id and a kind, or "your notifications changed") – never data.
 * Clients refetch through the normal REST endpoints, which enforce authorization, so the stream cannot leak
 * anything a caller may not read. Single-instance, in-memory registry; move to a message broker when running
 * several backend replicas.
 */
@Service
public class LiveEventService {

    private static final Logger log = LoggerFactory.getLogger(LiveEventService.class);

    /** Connections are recycled so a revoked session does not keep a stream open for long. */
    static final long STREAM_TIMEOUT_MS = 10 * 60_000L;
    static final int MAX_TOURNAMENTS_PER_STREAM = 5;
    static final int MAX_STREAMS_PER_CLIENT = 6;
    static final int MAX_STREAMS_TOTAL = 5_000;

    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final Map<String, AtomicInteger> perClient = new ConcurrentHashMap<>();
    // Sending happens off the request thread, so a slow client never delays an API response.
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "live-events");
        t.setDaemon(true);
        return t;
    });

    /** One open stream. {@code send} is synchronized because SseEmitter is not safe for concurrent writes. */
    private final class Client {
        final SseEmitter emitter;
        final UUID userId;
        final Set<UUID> tournaments;
        final String clientKey;
        volatile boolean closed;

        Client(SseEmitter emitter, UUID userId, Set<UUID> tournaments, String clientKey) {
            this.emitter = emitter;
            this.userId = userId;
            this.tournaments = tournaments;
            this.clientKey = clientKey;
        }

        synchronized void send(SseEmitter.SseEventBuilder event) {
            if (closed) {
                return;
            }
            try {
                emitter.send(event);
            } catch (IOException | IllegalStateException e) {
                // Client went away; the completion callback removes it.
                close();
            }
        }

        void close() {
            if (!closed) {
                closed = true;
                emitter.complete();
            }
            remove(this);
        }
    }

    /**
     * Opens a stream for the caller. {@code userId} is null for anonymous visitors, who only get tournament hints.
     * {@code clientKey} identifies the caller for connection limits (user id or remote address).
     */
    public SseEmitter open(UUID userId, Collection<UUID> tournamentIds, String clientKey) {
        if (tournamentIds.size() > MAX_TOURNAMENTS_PER_STREAM) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "LIVE_TOO_MANY_TOPICS");
        }
        if (clients.size() >= MAX_STREAMS_TOTAL) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LIVE_UNAVAILABLE");
        }
        AtomicInteger count = perClient.computeIfAbsent(clientKey, k -> new AtomicInteger());
        if (count.incrementAndGet() > MAX_STREAMS_PER_CLIENT) {
            count.decrementAndGet();
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LIVE_TOO_MANY_STREAMS");
        }

        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        Client client = new Client(emitter, userId, Set.copyOf(tournamentIds), clientKey);
        emitter.onCompletion(() -> remove(client));
        emitter.onTimeout(client::close);
        emitter.onError(e -> client.close());
        clients.add(client);
        // First event tells the browser the stream is live (and flushes proxies).
        client.send(SseEmitter.event().name("ready").data("{}", MediaType.APPLICATION_JSON).reconnectTime(5_000));
        return emitter;
    }

    private void remove(Client client) {
        if (clients.remove(client)) {
            perClient.computeIfPresent(client.clientKey, (k, c) -> c.decrementAndGet() <= 0 ? null : c);
        }
    }

    /** Something in the tournament changed (results, rounds, timer, teams, judge calls...). */
    public void tournamentChanged(UUID tournamentId, String kind) {
        if (tournamentId == null) {
            return;
        }
        String data = "{\"id\":\"" + tournamentId + "\",\"kind\":\"" + kind + "\"}";
        dispatch(c -> c.tournaments.contains(tournamentId), "tournament", data);
    }

    /** The user's notification inbox changed. */
    public void notificationsChanged(UUID userId) {
        if (userId == null) {
            return;
        }
        dispatch(c -> userId.equals(c.userId), "notifications", "{}");
    }

    /** Like {@link #tournamentChanged}, but waits for the surrounding transaction to commit (if any). */
    public void tournamentChangedAfterCommit(UUID tournamentId, String kind) {
        afterCommit(() -> tournamentChanged(tournamentId, kind));
    }

    /** Like {@link #notificationsChanged}, but waits for the surrounding transaction to commit (if any). */
    public void notificationsChangedAfterCommit(UUID userId) {
        afterCommit(() -> notificationsChanged(userId));
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    private void dispatch(Predicate<Client> who, String name, String data) {
        List<Client> targets = clients.stream().filter(who).toList();
        if (targets.isEmpty()) {
            return;
        }
        sender.execute(() -> targets.forEach(c ->
                c.send(SseEmitter.event().name(name).data(data, MediaType.APPLICATION_JSON))));
    }

    /** Comment lines keep idle connections open: the Next.js proxy drops a request after 30 s without data. */
    @Scheduled(fixedRate = 15_000, initialDelay = 15_000)
    public void heartbeat() {
        List<Client> all = List.copyOf(clients);
        if (!all.isEmpty()) {
            sender.execute(() -> all.forEach(c -> c.send(SseEmitter.event().comment("hb"))));
        }
    }

    int openStreams() {
        return clients.size();
    }

    @PreDestroy
    void shutdown() {
        List.copyOf(clients).forEach(Client::close);
        sender.shutdownNow();
        log.debug("Live event streams closed");
    }
}
