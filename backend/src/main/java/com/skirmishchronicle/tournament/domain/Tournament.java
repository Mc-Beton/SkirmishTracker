package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import com.skirmishchronicle.pairing.PairingModels.FirstRoundMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tournaments")
public class Tournament extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 10000)
    private String description;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "venue_name", length = 120)
    private String venueName;

    @Column(length = 200)
    private String address;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(nullable = false, length = 2)
    private String country = "PL";

    @Column(name = "entry_fee_amount", precision = 10, scale = 2)
    private BigDecimal entryFeeAmount;

    @Column(name = "entry_fee_currency", length = 3)
    private String entryFeeCurrency;

    @Enumerated(EnumType.STRING)
    @Column(name = "tournament_rank", nullable = false, length = 20)
    private TournamentRank rank;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TournamentFormat format;

    @Column(name = "max_players")
    private Integer maxPlayers;

    @Column(name = "points_limit")
    private Integer pointsLimit;

    @Column(name = "rounds_planned")
    private Integer roundsPlanned;

    @Column(name = "list_deadline")
    private Instant listDeadline;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TournamentStatus status = TournamentStatus.DRAFT;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "first_round_mode", nullable = false, length = 30)
    private FirstRoundMode firstRoundMode = FirstRoundMode.RANDOM;

    @Column(name = "challenges_enabled", nullable = false)
    private boolean challengesEnabled;

    @Column(name = "challenges_public", nullable = false)
    private boolean challengesPublic = true;

    @Column(name = "avoid_same_club", nullable = false)
    private boolean avoidSameClub;

    @Column(name = "avoid_same_faction", nullable = false)
    private boolean avoidSameFaction;

    @Column(name = "avoid_same_city", nullable = false)
    private boolean avoidSameCity;

    @Column(name = "soft_prefs_first_round", nullable = false)
    private boolean softPrefsFirstRound;

    @Enumerated(EnumType.STRING)
    @Column(name = "scoring_mode", nullable = false, length = 30)
    private ScoringMode scoringMode = ScoringMode.WIN_DRAW_LOSS;

    @Column(name = "win_points", nullable = false)
    private int winPoints = 3;

    @Column(name = "draw_points", nullable = false)
    private int drawPoints = 1;

    @Column(name = "loss_points", nullable = false)
    private int lossPoints;

    @Column(name = "small_points_multiplier", nullable = false)
    private int smallPointsMultiplier = 2;

    @Column(name = "bye_big_points", nullable = false)
    private int byeBigPoints = 3;

    @Column(name = "bye_small_points", nullable = false)
    private int byeSmallPoints;

    @Column(name = "split_big_points", nullable = false)
    private int splitBigPoints = 1;

    @Column(name = "split_small_points", nullable = false)
    private int splitSmallPoints;

    @Column(name = "difference_table", nullable = false, length = 1000)
    private String differenceTable = DifferenceRow.DEFAULT;

    @Column(name = "top_cut", nullable = false)
    private int topCut;

    /** Marked official by the game publisher / portal admin: counts towards season rankings. */
    @Column(nullable = false)
    private boolean official;

    @Column(name = "official_by")
    private UUID officialBy;

    @Column(name = "official_at")
    private Instant officialAt;

    @Column(name = "team_size")
    private Integer teamSize;

    @Column(name = "team_unique_factions", nullable = false)
    private boolean teamUniqueFactions;

    @Version
    private Long version;

    protected Tournament() {
    }

    public Tournament(UUID ownerId) {
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    /** Copies all organizer-editable details. */
    public void updateDetails(TournamentDetails d) {
        this.name = d.name().trim();
        this.description = d.description();
        this.startsAt = d.startsAt();
        this.endsAt = d.endsAt();
        this.venueName = d.venueName();
        this.address = d.address();
        this.city = d.city().trim();
        this.country = d.country() == null ? "PL" : d.country();
        this.entryFeeAmount = d.entryFeeAmount();
        this.entryFeeCurrency = d.entryFeeAmount() == null ? null
                : (d.entryFeeCurrency() == null ? "PLN" : d.entryFeeCurrency());
        this.rank = d.rank();
        this.format = d.format();
        this.maxPlayers = d.maxPlayers();
        this.pointsLimit = d.pointsLimit();
        this.roundsPlanned = d.roundsPlanned();
        this.listDeadline = d.listDeadline();
    }

    public void updateSettings(TournamentSettings st) {
        this.firstRoundMode = st.firstRoundMode();
        this.challengesEnabled = st.challengesEnabled();
        this.challengesPublic = st.challengesPublic();
        this.avoidSameClub = st.avoidSameClub();
        this.avoidSameFaction = st.avoidSameFaction();
        this.avoidSameCity = st.avoidSameCity();
        this.softPrefsFirstRound = st.softPrefsFirstRound();
        this.scoringMode = st.scoringMode();
        this.winPoints = st.winPoints();
        this.drawPoints = st.drawPoints();
        this.lossPoints = st.lossPoints();
        this.smallPointsMultiplier = st.smallPointsMultiplier();
        this.byeBigPoints = st.byeBigPoints();
        this.byeSmallPoints = st.byeSmallPoints();
        this.splitBigPoints = st.splitBigPoints();
        this.splitSmallPoints = st.splitSmallPoints();
        this.differenceTable = DifferenceRow.format(st.differenceTable());
        this.topCut = format == TournamentFormat.ELIMINATION ? 0 : st.topCut();
        this.teamSize = st.teamSize();
        this.teamUniqueFactions = st.teamSize() != null && st.teamUniqueFactions();
    }

    public TournamentSettings settings() {
        return new TournamentSettings(firstRoundMode, challengesEnabled, challengesPublic, avoidSameClub,
                avoidSameFaction, avoidSameCity, softPrefsFirstRound, scoringMode, winPoints, drawPoints,
                lossPoints, smallPointsMultiplier, byeBigPoints, byeSmallPoints, splitBigPoints, splitSmallPoints,
                DifferenceRow.parse(differenceTable), topCut, teamSize, teamUniqueFactions);
    }

    public void changeStatus(TournamentStatus next) {
        this.status = next;
    }

    public Integer getTeamSize() {
        return teamSize;
    }

    public boolean isTeamTournament() {
        return teamSize != null;
    }

    public boolean isOwnedBy(UUID userId) {
        return ownerId.equals(userId);
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public String getVenueName() {
        return venueName;
    }

    public String getAddress() {
        return address;
    }

    public String getCity() {
        return city;
    }

    public String getCountry() {
        return country;
    }

    public BigDecimal getEntryFeeAmount() {
        return entryFeeAmount;
    }

    public String getEntryFeeCurrency() {
        return entryFeeCurrency;
    }

    public TournamentRank getRank() {
        return rank;
    }

    public TournamentFormat getFormat() {
        return format;
    }

    public Integer getMaxPlayers() {
        return maxPlayers;
    }

    public Integer getPointsLimit() {
        return pointsLimit;
    }

    public Integer getRoundsPlanned() {
        return roundsPlanned;
    }

    public Instant getListDeadline() {
        return listDeadline;
    }

    public TournamentStatus getStatus() {
        return status;
    }

    public boolean isOfficial() {
        return official;
    }

    public void markOfficial(boolean value, UUID by) {
        this.official = value;
        this.officialBy = value ? by : null;
        this.officialAt = value ? Instant.now() : null;
    }
}
