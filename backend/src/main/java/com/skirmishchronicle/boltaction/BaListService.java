package com.skirmishchronicle.boltaction;

import com.skirmishchronicle.audit.AuditService;
import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.notification.NotificationService;
import com.skirmishchronicle.notification.NotificationType;
import com.skirmishchronicle.tournament.domain.ListStatus;
import com.skirmishchronicle.tournament.domain.ParticipantStatus;
import com.skirmishchronicle.tournament.domain.RoundStatus;
import com.skirmishchronicle.tournament.domain.Tournament;
import com.skirmishchronicle.tournament.domain.TournamentParticipant;
import com.skirmishchronicle.tournament.domain.TournamentStatus;
import com.skirmishchronicle.tournament.repo.ParticipantRepository;
import com.skirmishchronicle.tournament.repo.RoundRepository;
import com.skirmishchronicle.tournament.service.TournamentGuard;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bolt Action tournament lists. The app does not validate the army itself (no unit data): the player picks a
 * nation, declares points, order dice and platoons (checked against the organizer's limits) and gives the list as
 * pasted text and/or a PDF. The organizer reviews it (list status) like an Eldfall warband.
 */
@Service
public class BaListService {

    public static final int MAX_TEXT = 20_000;
    public static final int MAX_PDF_BYTES = 5 * 1024 * 1024;
    private static final String AUDIT_TYPE = "TOURNAMENT";

    public record ListView(UUID userId, String displayName, String nation, int points, int orderDice, int platoons,
                           String text, String pdfName, Integer pdfSize, ListStatus status, Instant updatedAt,
                           boolean editable) {
    }

    /** The caller's own list plus the organizer's limits (list null = nothing saved yet). */
    public record MyList(ListView list, boolean editable, Integer pointsLimit, Integer maxOrderDice,
                         Integer maxPlatoons, Instant listDeadline) {
    }

    public record Summary(UUID userId, String displayName, String nation, int points, int orderDice, int platoons,
                         boolean hasPdf, boolean hasText, ListStatus status, Instant updatedAt) {
    }

    public record SaveInput(String nation, int points, int orderDice, int platoons, String text) {
    }

    /** PDF bytes for download with a safe file name. */
    public record Pdf(String fileName, byte[] bytes, String sha256) {
    }

    private final TournamentGuard guard;
    private final BaListRepository lists;
    private final BaListPdfRepository pdfs;
    private final ParticipantRepository participants;
    private final RoundRepository rounds;
    private final UserRepository users;
    private final NotificationService notifications;
    private final AuditService audit;

    public BaListService(TournamentGuard guard, BaListRepository lists, BaListPdfRepository pdfs,
                         ParticipantRepository participants, RoundRepository rounds, UserRepository users,
                         NotificationService notifications, AuditService audit) {
        this.guard = guard;
        this.lists = lists;
        this.pdfs = pdfs;
        this.participants = participants;
        this.rounds = rounds;
        this.users = users;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ read

    @Transactional(readOnly = true)
    public MyList mine(CurrentUser actor, UUID tournamentId) {
        Tournament t = requireBoltAction(guard.visible(actor, tournamentId));
        TournamentParticipant p = participants.findByTournamentIdAndUserId(tournamentId, actor.id())
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PARTICIPANT"));
        boolean editable = playerMayEdit(t, p);
        ListView view = lists.findByTournamentIdAndUserId(tournamentId, actor.id())
                .map(l -> view(l, p.getListStatus(), editable)).orElse(null);
        return new MyList(view, editable, t.getPointsLimit(), t.getMaxOrderDice(), t.getMaxPlatoons(),
                t.getListDeadline());
    }

    @Transactional(readOnly = true)
    public List<Summary> list(CurrentUser viewer, UUID tournamentId) {
        Tournament t = requireBoltAction(guard.visible(viewer, tournamentId));
        if (!TournamentGuard.canManage(viewer, t) && !listsPublic(t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WARBANDS_HIDDEN");
        }
        Map<UUID, TournamentParticipant> byUser = participants
                .findByTournamentIdOrderByStatusAscRegisteredAtAsc(tournamentId).stream()
                .collect(Collectors.toMap(TournamentParticipant::getUserId, Function.identity()));
        List<BaList> rows = lists.findByTournamentId(tournamentId).stream()
                .filter(l -> byUser.containsKey(l.getUserId())).toList();
        Map<UUID, String> names = names(rows.stream().map(BaList::getUserId).collect(Collectors.toSet()));
        return rows.stream()
                .map(l -> new Summary(l.getUserId(), names.getOrDefault(l.getUserId(), "?"), l.getNation(),
                        l.getPoints(), l.getOrderDice(), l.getPlatoons(), l.hasPdf(),
                        l.getText() != null && !l.getText().isBlank(), byUser.get(l.getUserId()).getListStatus(),
                        l.getUpdatedAt()))
                .sorted((a, b) -> a.displayName().compareToIgnoreCase(b.displayName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ListView get(CurrentUser viewer, UUID tournamentId, UUID userId) {
        Tournament t = requireBoltAction(guard.visible(viewer, tournamentId));
        boolean manager = TournamentGuard.canManage(viewer, t);
        boolean own = viewer != null && viewer.id().equals(userId);
        requireReadable(t, manager, own);
        TournamentParticipant p = participants.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseThrow(BaListService::notFound);
        BaList l = lists.findByTournamentIdAndUserId(tournamentId, userId).orElseThrow(BaListService::notFound);
        boolean editable = manager ? organizerMayEdit(t) : own && playerMayEdit(t, p);
        return view(l, p.getListStatus(), editable);
    }

    @Transactional(readOnly = true)
    public Pdf pdf(CurrentUser viewer, UUID tournamentId, UUID userId) {
        Tournament t = requireBoltAction(guard.visible(viewer, tournamentId));
        boolean manager = TournamentGuard.canManage(viewer, t);
        boolean own = viewer != null && viewer.id().equals(userId);
        requireReadable(t, manager, own);
        participants.findByTournamentIdAndUserId(tournamentId, userId).orElseThrow(BaListService::notFound);
        BaList l = lists.findByTournamentIdAndUserId(tournamentId, userId).orElseThrow(BaListService::notFound);
        BaListPdf pdf = pdfs.findById(l.getId()).orElseThrow(BaListService::notFound);
        return new Pdf(l.getPdfName(), pdf.getBytes(), pdf.getSha256());
    }

    // ------------------------------------------------------------------ write

    /** The player (own list) or the organizer (any participant's list) saves nation, declarations and text. */
    @Transactional
    public ListView save(CurrentUser actor, UUID tournamentId, UUID userId, SaveInput input) {
        Tournament t = lockForWrite(actor, tournamentId);
        Ctx c = context(actor, t, userId);
        validate(t, input);
        BaList l = lists.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseGet(() -> new BaList(tournamentId, userId));
        String text = input.text() == null || input.text().isBlank() ? null : input.text().strip();
        l.update(input.nation(), input.points(), input.orderDice(), input.platoons(), text);
        lists.save(l);
        c.participant().setFaction(input.nation());
        afterChange(actor, t, c, l, c.own() ? "BA_LIST_SAVED" : "BA_LIST_EDITED_BY_ORGANIZER",
                input.nation() + ", " + input.points() + " pts, " + input.orderDice() + " dice");
        return view(l, c.participant().getListStatus(), true);
    }

    /** Attaches (or replaces) the list PDF; the list itself (nation, declarations) must be saved first. */
    @Transactional
    public ListView uploadPdf(CurrentUser actor, UUID tournamentId, UUID userId, String fileName, byte[] bytes) {
        Tournament t = lockForWrite(actor, tournamentId);
        Ctx c = context(actor, t, userId);
        if (!isPdf(bytes)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PDF_INVALID");
        }
        BaList l = lists.findByTournamentIdAndUserId(tournamentId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BA_LIST_SAVE_FIRST"));
        String sha = sha256(bytes);
        BaListPdf pdf = pdfs.findById(l.getId()).orElse(null);
        if (pdf == null) {
            pdfs.save(new BaListPdf(l.getId(), bytes, sha));
        } else {
            pdf.replace(bytes, sha);
        }
        l.attachPdf(safeName(fileName), bytes.length);
        afterChange(actor, t, c, l, "BA_LIST_PDF_UPLOADED", l.getPdfName());
        return view(l, c.participant().getListStatus(), true);
    }

    @Transactional
    public ListView deletePdf(CurrentUser actor, UUID tournamentId, UUID userId) {
        Tournament t = lockForWrite(actor, tournamentId);
        Ctx c = context(actor, t, userId);
        BaList l = lists.findByTournamentIdAndUserId(tournamentId, userId).orElseThrow(BaListService::notFound);
        pdfs.findById(l.getId()).ifPresent(pdfs::delete);
        l.detachPdf();
        afterChange(actor, t, c, l, "BA_LIST_PDF_REMOVED", null);
        return view(l, c.participant().getListStatus(), true);
    }

    // ------------------------------------------------------------------ rules

    private record Ctx(TournamentParticipant participant, boolean own, boolean manager) {
    }

    private Tournament lockForWrite(CurrentUser actor, UUID tournamentId) {
        Tournament t = guard.lock(tournamentId);
        if (!t.getStatus().isPublic() && !TournamentGuard.canManage(actor, t)) {
            throw TournamentGuard.notFound();
        }
        return requireBoltAction(t);
    }

    /** Own list (registered or waiting player) or the organizer; edit windows as for Eldfall warbands. */
    private Ctx context(CurrentUser actor, Tournament t, UUID userId) {
        boolean manager = TournamentGuard.canManage(actor, t);
        boolean own = actor.id().equals(userId);
        if (!own && !manager) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        TournamentParticipant p = participants.findByTournamentIdAndUserId(t.getId(), userId)
                .orElseThrow(() -> own ? new ApiException(HttpStatus.FORBIDDEN, "NOT_A_PARTICIPANT") : notFound());
        if (manager ? !organizerMayEdit(t) : !playerMayEdit(t, p)) {
            throw new ApiException(HttpStatus.CONFLICT, "WARBAND_LOCKED");
        }
        return new Ctx(p, own && !manager, manager);
    }

    /**
     * A player's change sends the list back to the organizer for review (or back to "not submitted" while it has
     * neither text nor PDF); the organizer's correction keeps the status.
     */
    private void afterChange(CurrentUser actor, Tournament t, Ctx c, BaList l, String action, String details) {
        TournamentParticipant p = c.participant();
        if (!l.isComplete()) {
            p.setListStatus(ListStatus.NOT_SUBMITTED);
        } else if (c.own() || p.getListStatus() == ListStatus.NOT_SUBMITTED) {
            p.setListStatus(ListStatus.SUBMITTED);
        }
        if (c.own() && l.isComplete()) {
            notifications.notify(t.getOwnerId(), NotificationType.WARBAND_SUBMITTED, Map.of("tournament", t.getName(),
                    "player", name(l.getUserId())), "/tournaments/" + t.getId() + "/warbands/" + l.getUserId());
        }
        audit.record(actor.id(), AUDIT_TYPE, t.getId(), action,
                name(l.getUserId()) + (details == null ? "" : ": " + details));
    }

    private static void validate(Tournament t, SaveInput in) {
        if (!BoltAction.isNation(in.nation())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "NATION_NOT_FOUND");
        }
        if (in.text() != null && in.text().length() > MAX_TEXT) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "LIST_TEXT_TOO_LONG");
        }
        if (t.getPointsLimit() != null && in.points() > t.getPointsLimit()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "POINTS_OVER_LIMIT");
        }
        if (t.getMaxOrderDice() != null && in.orderDice() > t.getMaxOrderDice()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ORDER_DICE_OVER_LIMIT");
        }
        if (t.getMaxPlatoons() != null && in.platoons() > t.getMaxPlatoons()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PLATOONS_OVER_LIMIT");
        }
    }

    private boolean playerMayEdit(Tournament t, TournamentParticipant p) {
        if (p.getStatus() != ParticipantStatus.REGISTERED && p.getStatus() != ParticipantStatus.WAITLIST) {
            return false;
        }
        if (!t.getStatus().acceptsRosterChanges() || rounds.countByTournamentId(t.getId()) > 0) {
            return false;
        }
        return t.getListDeadline() == null || Instant.now().isBefore(t.getListDeadline());
    }

    private static boolean organizerMayEdit(Tournament t) {
        return t.getStatus() != TournamentStatus.FINISHED && t.getStatus() != TournamentStatus.CANCELLED;
    }

    private void requireReadable(Tournament t, boolean manager, boolean own) {
        if (!manager && !own && !listsPublic(t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WARBANDS_HIDDEN");
        }
    }

    /** Whether other players see the lists, per the organizer's visibility setting. */
    boolean listsPublic(Tournament t) {
        TournamentStatus s = t.getStatus();
        return switch (t.getListVisibility()) {
            case PUBLIC -> true;
            case HIDDEN -> false;
            case AFTER_FIRST_PAIRINGS -> s == TournamentStatus.FINISHED
                    || rounds.existsByTournamentIdAndStatusNot(t.getId(), RoundStatus.PAIRED);
            case AFTER_DEADLINE -> s == TournamentStatus.IN_PROGRESS || s == TournamentStatus.FINISHED
                    || (t.getListDeadline() != null && !Instant.now().isBefore(t.getListDeadline()));
        };
    }

    private static Tournament requireBoltAction(Tournament t) {
        if (!t.isBoltAction()) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_AVAILABLE_FOR_GAME_SYSTEM");
        }
        return t;
    }

    /** Recognised by the signature only ("%PDF-" within the first bytes), never by name or declared type. */
    static boolean isPdf(byte[] b) {
        if (b == null || b.length < 8 || b.length > MAX_PDF_BYTES) {
            return false;
        }
        byte[] sig = "%PDF-".getBytes(StandardCharsets.US_ASCII);
        // The header may follow a few junk bytes (tolerated by readers); look in the first 1 KB.
        int limit = Math.min(b.length - sig.length, 1024);
        for (int i = 0; i <= limit; i++) {
            boolean match = true;
            for (int j = 0; j < sig.length; j++) {
                if (b[i + j] != sig[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return true;
            }
        }
        return false;
    }

    /** Letters, digits, space, dot, dash, underscore; at most 100 characters; always ends with ".pdf". */
    static String safeName(String name) {
        String base = name == null ? "" : name.replaceAll("[^\\p{L}\\p{N} ._-]", "").strip();
        if (base.toLowerCase().endsWith(".pdf")) {
            base = base.substring(0, base.length() - 4);
        }
        if (base.isBlank()) {
            base = "list";
        }
        if (base.length() > 96) {
            base = base.substring(0, 96);
        }
        return base + ".pdf";
    }

    private static String sha256(byte[] b) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private ListView view(BaList l, ListStatus status, boolean editable) {
        return new ListView(l.getUserId(), name(l.getUserId()), l.getNation(), l.getPoints(), l.getOrderDice(),
                l.getPlatoons(), l.getText(), l.getPdfName(), l.getPdfSize(), status, l.getUpdatedAt(), editable);
    }

    private String name(UUID userId) {
        return users.findById(userId).map(User::getDisplayName).orElse("?");
    }

    private Map<UUID, String> names(Set<UUID> ids) {
        return users.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName, (a, b) -> a));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "WARBAND_NOT_FOUND");
    }
}
