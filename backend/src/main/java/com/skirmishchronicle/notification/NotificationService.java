package com.skirmishchronicle.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.live.LiveEventService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-app notifications. {@link #notify} joins the caller's transaction, so a notification is stored only when the
 * change that caused it commits. Params are plain display values (names, numbers) – never secrets.
 */
@Service
public class NotificationService {

    public static final int PAGE = 30;
    private static final int KEEP_DAYS = 60;

    public record View(UUID id, NotificationType type, JsonNode params, String link, Instant createdAt, boolean read) {
    }

    public record Inbox(List<View> items, long unread) {
    }

    private final NotificationRepository notifications;
    private final ObjectMapper mapper;
    private final LiveEventService live;
    private final com.skirmishchronicle.push.PushService push;

    public NotificationService(NotificationRepository notifications, ObjectMapper mapper, LiveEventService live,
                               com.skirmishchronicle.push.PushService push) {
        this.notifications = notifications;
        this.mapper = mapper;
        this.live = live;
        this.push = push;
    }

    @Transactional
    public void notify(UUID userId, NotificationType type, Map<String, ?> params, String link) {
        if (userId == null) {
            return;
        }
        notifications.save(new Notification(userId, type.name(), json(params), link));
        live.notificationsChangedAfterCommit(userId);
        push.sendAfterCommit(userId, type.name(), params, link);
    }

    @Transactional
    public void notifyAll(Collection<UUID> userIds, NotificationType type, Map<String, ?> params, String link) {
        userIds.stream().distinct().forEach(u -> notify(u, type, params, link));
    }

    @Transactional(readOnly = true)
    public Inbox inbox(CurrentUser actor) {
        List<View> items = notifications.findByUserIdOrderByCreatedAtDesc(actor.id(), PageRequest.of(0, PAGE)).stream()
                .map(n -> new View(n.getId(), type(n.getType()), parse(n.getParams()), n.getLink(), n.getCreatedAt(),
                        n.getReadAt() != null))
                .filter(v -> v.type() != null)
                .toList();
        return new Inbox(items, notifications.countByUserIdAndReadAtIsNull(actor.id()));
    }

    @Transactional
    public void markRead(CurrentUser actor, UUID id) {
        Notification n = notifications.findById(id)
                .filter(x -> x.getUserId().equals(actor.id()))  // only your own (IDOR)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND"));
        n.markRead();
    }

    @Transactional
    public void markAllRead(CurrentUser actor) {
        notifications.markAllRead(actor.id(), Instant.now());
    }

    @Scheduled(cron = "0 45 3 * * *")
    @Transactional
    public void cleanup() {
        notifications.deleteOlderThan(Instant.now().minus(KEEP_DAYS, ChronoUnit.DAYS));
    }

    private String json(Map<String, ?> params) {
        try {
            String s = mapper.writeValueAsString(params == null ? Map.of() : params);
            return s.length() > 2000 ? "{}" : s;
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private JsonNode parse(String s) {
        try {
            return mapper.readTree(s);
        } catch (JsonProcessingException e) {
            return mapper.createObjectNode();
        }
    }

    private static NotificationType type(String s) {
        try {
            return NotificationType.valueOf(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
