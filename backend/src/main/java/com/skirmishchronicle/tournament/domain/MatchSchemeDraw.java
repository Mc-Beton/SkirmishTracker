package com.skirmishchronicle.tournament.domain;

import com.skirmishchronicle.common.AbstractEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Schemes a player drew for one game (server-side d20 rolls) and the one they kept. */
@Entity
@Table(name = "match_scheme_draws")
public class MatchSchemeDraw extends AbstractEntity {

    public record Card(String scheme, int roll) {
    }

    @Id
    private UUID id;

    @Column(name = "match_id", nullable = false)
    private UUID matchId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 60)
    private String faction;

    @Column(name = "leader_int", nullable = false)
    private int leaderInt;

    /** "SCHEME_CODE:roll,SCHEME_CODE:roll". */
    @Column(nullable = false, length = 400)
    private String cards;

    @Column(name = "kept_code", length = 60)
    private String keptCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MatchSchemeDraw() {
    }

    public MatchSchemeDraw(UUID matchId, UUID userId, String faction, int leaderInt, List<Card> drawn) {
        this.id = UUID.randomUUID();
        this.matchId = matchId;
        this.userId = userId;
        this.faction = faction;
        this.leaderInt = leaderInt;
        this.cards = String.join(",", drawn.stream().map(c -> c.scheme() + ":" + c.roll()).toList());
        this.createdAt = Instant.now();
    }

    public List<Card> getCards() {
        List<Card> out = new ArrayList<>();
        for (String part : cards.split(",")) {
            String[] f = part.split(":");
            out.add(new Card(f[0], Integer.parseInt(f[1])));
        }
        return out;
    }

    public void keep(String schemeCode) {
        this.keptCode = schemeCode;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public UUID getMatchId() {
        return matchId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getFaction() {
        return faction;
    }

    public int getLeaderInt() {
        return leaderInt;
    }

    public String getKeptCode() {
        return keptCode;
    }
}
