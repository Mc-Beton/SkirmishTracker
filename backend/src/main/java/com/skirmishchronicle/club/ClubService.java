package com.skirmishchronicle.club;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.club.ClubStore.Club;
import com.skirmishchronicle.club.ClubStore.Listed;
import com.skirmishchronicle.club.ClubStore.Person;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.common.Tokens;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Players' teams. One player founds a team and owns it; others join by the team's link, by the owner's invitation
 * (the invited player accepts) or by asking (the owner accepts). A player is in at most one team. Only the owner
 * changes the team; every method checks who is asking.
 */
@Service
public class ClubService {

    private static final String AUDIT_TYPE = "CLUB";
    static final int MAX_MEMBERS = 100;
    /** Open invitations and requests of one team. */
    static final int MAX_OPEN = 60;
    /** Teams one player may ask to join at the same time. */
    static final int MAX_OWN_REQUESTS = 5;
    private static final String INVITE = "INVITE";
    private static final String REQUEST = "REQUEST";

    /** you: OWNER, MEMBER, INVITED, REQUESTED or NONE. invitations / requests / hasLink: for the owner only. */
    public record ClubView(UUID id, String name, UUID ownerId, String ownerName, List<Person> members, String you,
                           List<Person> invitations, List<Person> requests, boolean hasLink) {
    }

    /** The player's own team (or null), the teams that invited them and the teams they asked to join. */
    public record Mine(ClubView club, List<Listed> invitations, List<Listed> requests) {
    }

    private final ClubStore store;
    private final NotificationService notifications;
    private final AuditService audit;

    public ClubService(ClubStore store, NotificationService notifications, AuditService audit) {
        this.store = store;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ reading

    @Transactional(readOnly = true)
    public Mine mine(CurrentUser actor) {
        return new Mine(store.ofUser(actor.id()).map(c -> view(actor, c)).orElse(null),
                store.requestsOfUser(actor.id(), INVITE), store.requestsOfUser(actor.id(), REQUEST));
    }

    @Transactional(readOnly = true)
    public ClubView get(CurrentUser actor, UUID id) {
        return view(actor, store.find(id).orElseThrow(ClubService::notFound));
    }

    @Transactional(readOnly = true)
    public List<Listed> search(String query) {
        String q = query == null ? "" : query.strip();
        return store.search(q.length() > 80 ? q.substring(0, 80) : q, 30);
    }

    // ------------------------------------------------------------------ the owner

    @Transactional
    public ClubView create(CurrentUser actor, String rawName) {
        String name = name(rawName);
        requireNoTeam(actor.id());
        if (store.nameTaken(name, null)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NAME_TAKEN");
        }
        UUID id = UUID.randomUUID();
        try {
            store.insert(id, name, actor.id());
            store.addMember(id, name, actor.id());
        } catch (DuplicateKeyException e) {
            // somebody took the name, or the player joined a team, a moment ago
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NAME_TAKEN");
        }
        audit.record(actor.id(), AUDIT_TYPE, id, "CREATED", name);
        return get(actor, id);
    }

    @Transactional
    public ClubView rename(CurrentUser actor, UUID id, String rawName) {
        Club c = owned(actor, id);
        String name = name(rawName);
        if (store.nameTaken(name, id)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NAME_TAKEN");
        }
        try {
            store.rename(id, name);
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NAME_TAKEN");
        }
        audit.record(actor.id(), AUDIT_TYPE, id, "RENAMED", c.name() + " -> " + name);
        return get(actor, id);
    }

    /** The team is dissolved: its members have no team any more. */
    @Transactional
    public void dissolve(CurrentUser actor, UUID id) {
        Club c = owned(actor, id);
        store.delete(id);
        audit.record(actor.id(), AUDIT_TYPE, id, "DISSOLVED", c.name());
    }

    /** A new link to the team (the old one stops working); whoever opens it and is signed in joins. */
    @Transactional
    public String newLink(CurrentUser actor, UUID id) {
        owned(actor, id);
        String token = Tokens.newToken();
        store.setInvite(id, Tokens.sha256(token));
        return token;
    }

    @Transactional
    public void closeLink(CurrentUser actor, UUID id) {
        owned(actor, id);
        store.setInvite(id, null);
    }

    /** The owner invites a player by name; the player accepts or declines. */
    @Transactional
    public void invite(CurrentUser actor, UUID id, UUID userId) {
        Club c = owned(actor, id);
        if (userId == null || userId.equals(actor.id()) || !store.userExists(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PLAYER_NOT_FOUND");
        }
        if (store.ofUser(userId).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_PLAYER_HAS_TEAM");
        }
        if (REQUEST.equals(store.requestKind(id, userId).orElse(null))) {
            // the player has already asked: inviting them is saying yes
            join(c, userId);
            notifications.notify(userId, NotificationType.CLUB_DECISION, Map.of("team", c.name(), "accepted", true), "/teams");
            return;
        }
        if (store.requestCount(id) >= MAX_OPEN) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_TOO_MANY_OPEN");
        }
        store.putRequest(id, userId, INVITE);
        notifications.notify(userId, NotificationType.CLUB_INVITATION,
                Map.of("team", c.name(), "player", store.userName(actor.id())), "/teams");
    }

    @Transactional
    public void cancelInvitation(CurrentUser actor, UUID id, UUID userId) {
        owned(actor, id);
        store.deleteRequest(id, userId, INVITE);
    }

    /** The owner answers a player who asked to join. */
    @Transactional
    public void decideRequest(CurrentUser actor, UUID id, UUID userId, boolean accept) {
        Club c = owned(actor, id);
        if (!REQUEST.equals(store.requestKind(id, userId).orElse(null))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CLUB_NO_REQUEST");
        }
        if (accept) {
            join(c, userId);
        } else {
            store.deleteRequest(id, userId, REQUEST);
        }
        notifications.notify(userId, NotificationType.CLUB_DECISION, Map.of("team", c.name(), "accepted", accept), "/teams");
    }

    /** The owner hands the team over to another member. */
    @Transactional
    public void transfer(CurrentUser actor, UUID id, UUID userId) {
        Club c = owned(actor, id);
        if (userId == null || userId.equals(actor.id()) || !store.isMember(id, userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NOT_MEMBER");
        }
        store.setOwner(id, userId);
        audit.record(actor.id(), AUDIT_TYPE, id, "TRANSFERRED", c.name() + " -> " + store.userName(userId));
    }

    /** The owner removes a member, or a member leaves. The owner cannot leave: hand the team over or dissolve it. */
    @Transactional
    public void removeMember(CurrentUser actor, UUID id, UUID userId) {
        Club c = store.findForUpdate(id).orElseThrow(ClubService::notFound);
        boolean self = actor.id().equals(userId);
        if (!self && !c.ownerId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CLUB_OWNER_ONLY");
        }
        if (c.ownerId().equals(userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_OWNER_CANNOT_LEAVE");
        }
        if (!store.isMember(id, userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_NOT_MEMBER");
        }
        store.removeMember(id, userId);
        audit.record(actor.id(), AUDIT_TYPE, id, self ? "LEFT" : "REMOVED", store.userName(userId));
    }

    // ------------------------------------------------------------------ a player

    /** Joins by the team's link. */
    @Transactional
    public ClubView joinByLink(CurrentUser actor, String invite) {
        if (invite == null || invite.isBlank() || invite.length() > 100) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CLUB_INVITE_INVALID");
        }
        Club found = store.findByInvite(Tokens.sha256(invite))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CLUB_INVITE_INVALID"));
        if (store.isMember(found.id(), actor.id())) {
            return get(actor, found.id());
        }
        requireNoTeam(actor.id());
        join(found, actor.id());
        return get(actor, found.id());
    }

    /** The invited player accepts or declines. */
    @Transactional
    public void answerInvitation(CurrentUser actor, UUID id, boolean accept) {
        Club c = store.find(id).orElseThrow(ClubService::notFound);
        if (!INVITE.equals(store.requestKind(id, actor.id()).orElse(null))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CLUB_INVITE_INVALID");
        }
        if (accept) {
            requireNoTeam(actor.id());
            join(c, actor.id());
        } else {
            store.deleteRequest(id, actor.id(), INVITE);
        }
    }

    /** A player asks to join; the owner has to accept. */
    @Transactional
    public void request(CurrentUser actor, UUID id) {
        Club c = store.find(id).orElseThrow(ClubService::notFound);
        requireNoTeam(actor.id());
        String open = store.requestKind(id, actor.id()).orElse(null);
        if (INVITE.equals(open)) {
            // the owner has already invited them: asking is saying yes
            join(c, actor.id());
            return;
        }
        if (REQUEST.equals(open)) {
            return;
        }
        if (store.requestCountOfUser(actor.id(), REQUEST) >= MAX_OWN_REQUESTS || store.requestCount(id) >= MAX_OPEN) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_TOO_MANY_OPEN");
        }
        store.putRequest(id, actor.id(), REQUEST);
        notifications.notify(c.ownerId(), NotificationType.CLUB_REQUEST,
                Map.of("team", c.name(), "player", store.userName(actor.id())), "/teams");
    }

    @Transactional
    public void withdrawRequest(CurrentUser actor, UUID id) {
        store.deleteRequest(id, actor.id(), REQUEST);
    }

    // ------------------------------------------------------------------ helpers

    private void join(Club c, UUID userId) {
        store.findForUpdate(c.id()).orElseThrow(ClubService::notFound);
        if (store.memberCount(c.id()) >= MAX_MEMBERS) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_FULL");
        }
        try {
            store.addMember(c.id(), c.name(), userId);
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_ALREADY_IN_TEAM");
        }
        audit.record(userId, AUDIT_TYPE, c.id(), "JOINED", c.name());
    }

    private void requireNoTeam(UUID userId) {
        if (store.ofUser(userId).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "CLUB_ALREADY_IN_TEAM");
        }
    }

    private Club owned(CurrentUser actor, UUID id) {
        Club c = store.findForUpdate(id).orElseThrow(ClubService::notFound);
        if (!c.ownerId().equals(actor.id())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CLUB_OWNER_ONLY");
        }
        return c;
    }

    private ClubView view(CurrentUser actor, Club c) {
        boolean owner = actor != null && c.ownerId().equals(actor.id());
        String you = "NONE";
        if (owner) {
            you = "OWNER";
        } else if (actor != null && store.isMember(c.id(), actor.id())) {
            you = "MEMBER";
        } else if (actor != null) {
            String open = store.requestKind(c.id(), actor.id()).orElse(null);
            you = INVITE.equals(open) ? "INVITED" : REQUEST.equals(open) ? "REQUESTED" : "NONE";
        }
        return new ClubView(c.id(), c.name(), c.ownerId(), store.userName(c.ownerId()), store.members(c.id()), you,
                owner ? store.requests(c.id(), INVITE) : List.of(), owner ? store.requests(c.id(), REQUEST) : List.of(),
                owner && store.hasInvite(c.id()));
    }

    private static String name(String raw) {
        String name = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (name.length() < 3 || name.length() > 80) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CLUB_NAME_INVALID");
        }
        return name;
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "CLUB_NOT_FOUND");
    }
}
