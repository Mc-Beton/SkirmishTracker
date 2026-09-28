package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tournament_rounds")
public class TournamentRound extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tournament_id", nullable = false)
    private UUID tournamentId;

    @Column(nullable = false)
    private int number;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoundStatus status = RoundStatus.PAIRED;

    @Column(name = "bye_big_points", nullable = false)
    private int byeBigPoints;

    @Column(name = "bye_small_points", nullable = false)
    private int byeSmallPoints;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoundPhase phase = RoundPhase.SWISS;

    @Column(name = "scenario_code", length = 60)
    private String scenarioCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "table_order", length = 20)
    private TableOrder tableOrder;

    /** Round timer: total seconds incl. added time (null = no timer). */
    @Column(name = "timer_seconds")
    private Integer timerSeconds;

    /** Seconds already counted down while the timer was running before the last pause. */
    @Column(name = "timer_elapsed", nullable = false)
    private int timerElapsed;

    @Column(name = "timer_running_since")
    private Instant timerRunningSince;

    @Column(name = "timer_notified", nullable = false)
    private boolean timerNotified;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected TournamentRound() {
    }

    public TournamentRound(UUID tournamentId, int number, int byeBigPoints, int byeSmallPoints) {
        this(tournamentId, number, byeBigPoints, byeSmallPoints, RoundPhase.SWISS);
    }

    public TournamentRound(UUID tournamentId, int number, int byeBigPoints, int byeSmallPoints, RoundPhase phase) {
        this.id = UUID.randomUUID();
        this.phase = phase;
        this.tournamentId = tournamentId;
        this.number = number;
        this.byeBigPoints = byeBigPoints;
        this.byeSmallPoints = byeSmallPoints;
        this.createdAt = Instant.now();
    }

    public void start() {
        status = RoundStatus.IN_PROGRESS;
        startedAt = Instant.now();
    }

    public void complete() {
        status = RoundStatus.COMPLETED;
        completedAt = Instant.now();
    }

    public String getScenarioCode() {
        return scenarioCode;
    }

    public void setScenarioCode(String scenarioCode) {
        this.scenarioCode = scenarioCode;
    }

    public void setByePoints(int big, int small) {
        this.byeBigPoints = big;
        this.byeSmallPoints = small;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getTournamentId() {
        return tournamentId;
    }

    // ---------------------------------------------------------------- timer

    /** Sets the length of the round (before or during it). */
    public void setTimerMinutes(Integer minutes) {
        this.timerSeconds = minutes == null ? null : minutes * 60;
        this.timerNotified = false;
    }

    /** Called when the round starts: a planned length starts counting down at once. */
    public void startTimerIfPlanned() {
        if (timerSeconds != null && timerRunningSince == null && timerElapsed == 0) {
            timerRunningSince = Instant.now();
        }
    }

    public void startTimer() {
        if (timerSeconds != null && timerRunningSince == null) {
            timerRunningSince = Instant.now();
        }
    }

    public void pauseTimer() {
        if (timerRunningSince != null) {
            timerElapsed = elapsedSeconds(Instant.now());
            timerRunningSince = null;
        }
    }

    /** Adds (or with a negative value removes) minutes. */
    public void addTimerMinutes(int minutes) {
        if (timerSeconds != null) {
            timerSeconds = Math.max(60, timerSeconds + minutes * 60);
            if (remainingSeconds(Instant.now()) > 0) {
                timerNotified = false;
            }
        }
    }

    public int elapsedSeconds(Instant now) {
        long running = timerRunningSince == null ? 0 : Math.max(0, now.getEpochSecond() - timerRunningSince.getEpochSecond());
        return (int) Math.min(Integer.MAX_VALUE, timerElapsed + running);
    }

    public int remainingSeconds(Instant now) {
        return timerSeconds == null ? 0 : Math.max(0, timerSeconds - elapsedSeconds(now));
    }

    /** True once, when the time is up and nobody was told yet. */
    public boolean takeTimeUp(Instant now) {
        if (timerSeconds == null || timerNotified || timerRunningSince == null || remainingSeconds(now) > 0) {
            return false;
        }
        timerNotified = true;
        return true;
    }

    public Integer getTimerSeconds() {
        return timerSeconds;
    }

    public boolean isTimerRunning() {
        return timerRunningSince != null;
    }

    public TableOrder getTableOrder() {
        return tableOrder;
    }

    public void setTableOrder(TableOrder tableOrder) {
        this.tableOrder = tableOrder;
    }

    public RoundPhase getPhase() {
        return phase;
    }

    public int getNumber() {
        return number;
    }

    public RoundStatus getStatus() {
        return status;
    }

    public int getByeBigPoints() {
        return byeBigPoints;
    }

    public int getByeSmallPoints() {
        return byeSmallPoints;
    }
}
