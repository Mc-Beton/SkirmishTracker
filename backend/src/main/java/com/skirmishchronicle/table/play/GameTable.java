package com.skirmishchronicle.table.play;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * One online game. Player A creates it with a map and a list and invites player B with a link (only the hash of
 * the invitation token is stored). The map is copied in ({@code mapSnapshot}); the game itself is the event log.
 */
@Entity
@Table(name = "game_tables")
public class GameTable extends AbstractEntity {

    public enum Status { WAITING, SETUP, PLAYING, FINISHED }

    /** Core Rules p.18: how much the players may pre-measure (enforced by the browser preview). */
    public enum MeasureMode { ASSISTED, STANDARD, REALISM }

    /** Who looks at the table. */
    public enum Role { PLAYER, JUDGE, OBSERVER, ADMIN, NONE }

    @Id
    private UUID id;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "player_a", nullable = false)
    private UUID playerA;

    @Column(name = "player_b")
    private UUID playerB;

    @Column(name = "invite_hash", length = 64)
    private String inviteHash;

    @Column(nullable = false, length = 20)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private Status status;

    @Column(name = "map_name", nullable = false, length = 80)
    private String mapName;

    /** Quest (scenario) played, from content/eldfall-core.json; null = free game. */
    @Column(name = "quest_code", length = 60)
    private String questCode;

    @Column(name = "map_snapshot", nullable = false, columnDefinition = "text")
    private String mapSnapshot;

    @Column(name = "width_in", nullable = false)
    private double widthIn;

    @Column(name = "height_in", nullable = false)
    private double heightIn;

    @Column(name = "deployment_depth", nullable = false)
    private double deploymentDepth;

    @Column(name = "deployment", nullable = false, length = 10)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private com.skirmishchronicle.table.engine.GameState.Deployment deployment =
            com.skirmishchronicle.table.engine.GameState.Deployment.STANDARD;

    @Column(name = "list_a", columnDefinition = "text")
    private String listA;

    @Column(name = "list_b", columnDefinition = "text")
    private String listB;

    @Column(name = "reported_game_id")
    private UUID reportedGameId;

    @Column(name = "measure_mode", nullable = false, length = 10)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private MeasureMode measureMode = MeasureMode.ASSISTED;

    @Column(name = "judge_id")
    private UUID judgeId;

    @Column(name = "judge_invite_hash", length = 64)
    private String judgeInviteHash;

    @Column(name = "observers_allowed", nullable = false)
    private boolean observersAllowed;

    @Column(name = "watch_invite_hash", length = 64)
    private String watchInviteHash;

    @Column(name = "next_seq", nullable = false)
    private long nextSeq = 1;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected GameTable() {
    }

    public GameTable(UUID createdBy, String mapName, String questCode, String mapSnapshot, double widthIn, double heightIn,
                     double deploymentDepth, String listA, String inviteHash, MeasureMode measureMode) {
        this(createdBy, mapName, questCode, mapSnapshot, widthIn, heightIn, deploymentDepth, null, listA, inviteHash, measureMode);
    }

    public GameTable(UUID createdBy, String mapName, String questCode, String mapSnapshot, double widthIn, double heightIn,
                     double deploymentDepth, com.skirmishchronicle.table.engine.GameState.Deployment deployment,
                     String listA, String inviteHash, MeasureMode measureMode) {
        if (deployment != null) {
            this.deployment = deployment;
        }
        this.measureMode = measureMode == null ? MeasureMode.ASSISTED : measureMode;
        this.questCode = questCode;
        this.id = UUID.randomUUID();
        this.createdBy = createdBy;
        this.playerA = createdBy;
        this.mapName = mapName;
        this.mapSnapshot = mapSnapshot;
        this.widthIn = widthIn;
        this.heightIn = heightIn;
        this.deploymentDepth = deploymentDepth;
        this.listA = listA;
        this.inviteHash = inviteHash;
        this.status = Status.WAITING;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    /** Player B takes the seat; the invitation is used up. */
    public void join(UUID playerB, String listB) {
        this.playerB = playerB;
        this.listB = listB;
        this.inviteHash = null;
        this.status = Status.SETUP;
        touch();
    }

    /** A new player invitation (only while the second seat is free); the old link stops working. */
    public void newPlayerInvite(String hash) {
        this.inviteHash = hash;
        touch();
    }

    public void newJudgeInvite(String hash) {
        this.judgeInviteHash = hash;
        touch();
    }

    /** The judge takes the seat; the judge invitation is used up. */
    public void judgeJoined(UUID judge) {
        this.judgeId = judge;
        this.judgeInviteHash = null;
        touch();
    }

    /** Observers on: a watch link (hash) is set. Off: no link. */
    public void observers(boolean allowed, String watchHash) {
        this.observersAllowed = allowed;
        this.watchInviteHash = allowed ? watchHash : null;
        touch();
    }

    /** Hands out {@code count} sequence numbers and returns the first. */
    public long takeSeq(int count) {
        long first = nextSeq;
        nextSeq += count;
        touch();
        return first;
    }

    public void setStatus(Status status) {
        this.status = status;
        touch();
    }

    private void touch() {
        this.updatedAt = Instant.now();
    }

    /** 0 for player A, 1 for player B, -1 for anybody else. */
    public int sideOf(UUID userId) {
        if (userId == null) {
            return -1;
        }
        if (userId.equals(playerA)) {
            return 0;
        }
        return userId.equals(playerB) ? 1 : -1;
    }

    public boolean isCreator(UUID userId) {
        return createdBy.equals(userId);
    }

    public boolean isJudge(UUID userId) {
        return userId != null && userId.equals(judgeId);
    }

    public MeasureMode getMeasureMode() {
        return measureMode;
    }

    public UUID getJudgeId() {
        return judgeId;
    }

    public String getJudgeInviteHash() {
        return judgeInviteHash;
    }

    public boolean isObserversAllowed() {
        return observersAllowed;
    }

    public String getWatchInviteHash() {
        return watchInviteHash;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getPlayerA() {
        return playerA;
    }

    public UUID getPlayerB() {
        return playerB;
    }

    public String getInviteHash() {
        return inviteHash;
    }

    public Status getStatus() {
        return status;
    }

    public String getMapName() {
        return mapName;
    }

    public UUID getReportedGameId() {
        return reportedGameId;
    }

    public void reported(UUID gameId) {
        this.reportedGameId = gameId;
        touch();
    }

    public String getQuestCode() {
        return questCode;
    }

    public String getMapSnapshot() {
        return mapSnapshot;
    }

    public double getWidthIn() {
        return widthIn;
    }

    public double getHeightIn() {
        return heightIn;
    }

    public com.skirmishchronicle.table.engine.GameState.Deployment getDeployment() {
        return deployment;
    }

    public double getDeploymentDepth() {
        return deploymentDepth;
    }

    public String getListA() {
        return listA;
    }

    public String getListB() {
        return listB;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
