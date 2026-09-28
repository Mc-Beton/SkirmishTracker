package com.skirmishchronicle.tournament;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.identity.service.JwtService;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Elimination (with BYEs), round robin, Swiss + top cut, leagues, own games, ELO and profiles. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class FormatsAndLeaguesIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    MockMvc mvc;

    @Autowired
    UserRepository users;

    @Autowired
    JwtService jwtService;

    @Autowired
    ObjectMapper json;

    private final Map<UUID, String> tokens = new HashMap<>();

    private UUID user(String nick) {
        User u = new User(nick.toLowerCase() + UUID.randomUUID() + "@example.com",
                nick + UUID.randomUUID().toString().substring(0, 5), "pl");
        u.markEmailVerified();
        users.save(u);
        tokens.put(u.getId(), "Bearer " + jwtService.issueAccessToken(u));
        return u.getId();
    }

    private MockHttpServletRequestBuilder as(UUID userId, MockHttpServletRequestBuilder req) {
        return req.with(csrf()).header("Authorization", tokens.get(userId));
    }

    private JsonNode read(UUID userId, String url) throws Exception {
        return json.readTree(mvc.perform(as(userId, get(url))).andReturn().getResponse().getContentAsString());
    }

    private String tournament(UUID orga, String extra) throws Exception {
        String body = "{\"name\":\"Format test\",\"startsAt\":\"2030-10-10T08:00:00Z\",\"city\":\"Kraków\","
                + "\"rank\":\"LOCAL\"," + extra + "}";
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        mvc.perform(as(orga, post("/api/tournaments/" + id + "/publish"))).andExpect(status().isNoContent());
        return "/api/tournaments/" + id;
    }

    private List<UUID> players(String base, int n) throws Exception {
        List<UUID> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            UUID p = user("P" + i);
            mvc.perform(as(p, post(base + "/registration"))).andExpect(status().isOk());
            list.add(p);
        }
        return list;
    }

    /** Pairs the next round, starts it, lets player A win every game 6:4 and completes it. Returns the round. */
    private JsonNode playRound(UUID orga, String base) throws Exception {
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        JsonNode rounds = read(orga, base + "/rounds");
        JsonNode round = rounds.get(rounds.size() - 1);
        int n = round.get("number").asInt();
        mvc.perform(as(orga, post(base + "/rounds/" + n + "/start"))).andExpect(status().isNoContent());
        for (JsonNode m : round.get("matches")) {
            if (m.get("playerB").isNull()) {
                continue;
            }
            mvc.perform(as(orga, put(base + "/matches/" + m.get("id").asText() + "/result"))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"PLAYED\",\"smallA\":6,\"smallB\":4}"))
                    .andExpect(status().isNoContent());
        }
        mvc.perform(as(orga, post(base + "/rounds/" + n + "/complete"))).andExpect(status().isNoContent());
        return round;
    }

    @Test
    void eliminationWithByesDownToOneWinner() throws Exception {
        UUID orga = user("Orga");
        String base = tournament(orga, "\"format\":\"ELIMINATION\"");
        players(base, 5);
        // 5 players → bracket of 8: three BYEs for seeds 1-3, seeds 4 and 5 play.
        JsonNode r1 = playRound(orga, base);
        assertThat(r1.get("phase").asText()).isEqualTo("KNOCKOUT");
        assertThat(r1.get("stage").asText()).isEqualTo("QUARTERFINAL");
        int byes = 0;
        for (JsonNode m : r1.get("matches")) {
            if (m.get("playerB").isNull()) {
                byes++;
                assertThat(m.get("seedA").asInt()).isLessThanOrEqualTo(3);
            }
        }
        assertThat(byes).isEqualTo(3);
        assertThat(playRound(orga, base).get("stage").asText()).isEqualTo("SEMIFINAL");
        JsonNode fin = playRound(orga, base);
        assertThat(fin.get("stage").asText()).isEqualTo("FINAL");
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALL_ROUNDS_PLAYED"));
        JsonNode rows = read(orga, base + "/standings").get("rows");
        assertThat(rows.get(0).get("position").asInt()).isEqualTo(1);
        assertThat(rows.get(1).get("position").asInt()).isEqualTo(2);
        assertThat(rows.get(2).get("position").asInt()).isEqualTo(3);
        assertThat(rows.get(3).get("position").asInt()).isEqualTo(3);
        assertThat(rows.get(0).get("eliminated").asBoolean()).isFalse();
        // Splits make no sense in a bracket.
        String finalId = read(orga, base + "/rounds").get(2).get("matches").get(0).get("id").asText();
        mvc.perform(as(orga, put(base + "/matches/" + finalId + "/result")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"SPLIT\"}")).andExpect(status().isConflict());
    }

    @Test
    void roundRobinThenFinishAndLeagueWithOwnGames() throws Exception {
        UUID orga = user("Orga");
        String base = tournament(orga, "\"format\":\"ROUND_ROBIN\"");
        List<UUID> ps = players(base, 3);
        for (int i = 0; i < 3; i++) {
            JsonNode r = playRound(orga, base);
            assertThat(r.get("phase").asText()).isEqualTo("ROUND_ROBIN");
            assertThat(r.get("matches").size()).isEqualTo(2);  // one game + one BYE
        }
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict());
        mvc.perform(as(orga, post(base + "/finish"))).andExpect(status().isNoContent());
        String tid = base.substring(base.lastIndexOf('/') + 1);

        // League: big points × 2 for local tournaments; the organizer owns it, so the submission is accepted at once.
        String leagueId = json.readTree(mvc.perform(as(orga, post("/api/leagues")).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Liga Krakowska","startsOn":"2020-01-01","endsOn":"2040-12-31","scoringMode":"BIG_POINTS",
                         "multiplierLocal":2,"multiplierMaster":3,"ownGamesAllowed":true}
                        """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        String league = "/api/leagues/" + leagueId;
        mvc.perform(as(orga, post(league + "/tournaments")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tournamentId\":\"" + tid + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));
        // A stranger cannot submit somebody else's tournament.
        mvc.perform(as(ps.get(0), post(league + "/tournaments")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"tournamentId\":\"" + tid + "\"}")).andExpect(status().isForbidden());

        JsonNode standings = read(orga, base + "/standings").get("rows");
        JsonNode table = json.readTree(mvc.perform(get(league)).andReturn().getResponse().getContentAsString());
        JsonNode top = table.get("standings").get(0);
        int topBig = 0;
        for (JsonNode r : standings) {
            if (r.get("userId").asText().equals(top.get("userId").asText())) {
                topBig = r.get("totalBigPoints").asInt();
            }
        }
        assertThat(top.get("points").asDouble()).isEqualTo(topBig * 2.0);

        // Own game between two members of the league: counts only after the opponent confirms.
        UUID a = ps.get(0);
        UUID b = ps.get(1);
        mvc.perform(as(a, post(league + "/members"))).andExpect(status().isNoContent());
        String report = "{\"opponentId\":\"" + b + "\",\"myScore\":9,\"opponentScore\":3,\"playedOn\":\""
                + java.time.LocalDate.now() + "\",\"leagueId\":\"" + leagueId + "\"}";
        mvc.perform(as(a, post("/api/games")).contentType(MediaType.APPLICATION_JSON).content(report))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_LEAGUE_MEMBERS"));
        mvc.perform(as(b, post(league + "/members"))).andExpect(status().isNoContent());
        String gameId = json.readTree(mvc.perform(as(a, post("/api/games")).contentType(MediaType.APPLICATION_JSON)
                .content(report)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        // The reporter cannot confirm their own report.
        mvc.perform(as(a, post("/api/games/" + gameId + "/confirm"))).andExpect(status().isForbidden());
        mvc.perform(as(b, post("/api/games/" + gameId + "/confirm"))).andExpect(status().isNoContent());
        mvc.perform(as(b, post("/api/games/" + gameId + "/reject"))).andExpect(status().isConflict());

        // Global ELO and the public profile.
        JsonNode ranking = json.readTree(mvc.perform(get("/api/ranking")).andReturn().getResponse().getContentAsString());
        assertThat(ranking.size()).isGreaterThanOrEqualTo(3);
        JsonNode profile = json.readTree(mvc.perform(get("/api/players/" + a)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(profile.get("stats").get("games").asInt()).isEqualTo(3);  // 2 tournament games + 1 own game
        assertThat(profile.get("tournaments").get(0).get("position").isNull()).isFalse();
        assertThat(profile.get("leagues").size()).isEqualTo(1);
        assertThat(profile.has("email")).isFalse();
        // Player search needs an account.
        mvc.perform(get("/api/players/search?q=P1")).andExpect(status().isUnauthorized());
        assertThat(read(a, "/api/players/search?q=P1").size()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void swissWithTopCut() throws Exception {
        UUID orga = user("Orga");
        mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Bez rund","startsAt":"2030-10-10T08:00:00Z","city":"Kraków","rank":"LOCAL","format":"SWISS",
                 "topCut":4}
                """)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TOP_CUT_REQUIRES_ROUNDS"));
        String base = tournament(orga, "\"format\":\"SWISS\",\"roundsPlanned\":2,\"topCut\":4");
        players(base, 6);
        assertThat(playRound(orga, base).get("phase").asText()).isEqualTo("SWISS");
        playRound(orga, base);
        JsonNode semi = playRound(orga, base);
        assertThat(semi.get("phase").asText()).isEqualTo("KNOCKOUT");
        assertThat(semi.get("matches").size()).isEqualTo(2);
        // Seed 1 meets seed 4.
        JsonNode first = semi.get("matches").get(0);
        assertThat(first.get("seedA").asInt() + first.get("seedB").asInt()).isEqualTo(5);
        playRound(orga, base);
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict());
        JsonNode rows = read(orga, base + "/standings").get("rows");
        assertThat(rows.get(0).get("knockout").asBoolean()).isTrue();
        assertThat(rows.get(4).get("knockout").asBoolean()).isFalse();
        assertThat(rows.get(4).get("position").asInt()).isEqualTo(5);
    }

    @Test
    void ownGameWithListsFeedsProfileStatistics() throws Exception {
        UUID a = user("Lista");
        UUID b = user("Rywal");
        String lists = ",\"myList\":{\"faction\":\"ONI_CLANS\",\"alliedFaction\":\"UNDEAD\",\"units\":["
                + "{\"unit\":\"CHIYOHIME\",\"leader\":true,\"items\":[{\"item\":\"POUCH\"}]},{\"unit\":\"BONEWALKER\"}]},"
                + "\"opponentList\":{\"faction\":\"HELIAN_LEAGUE\",\"units\":[{\"unit\":\"PALADIN_OF_THE_ORDER\","
                + "\"items\":[{\"item\":\"TACTICAL_EXPERTISE\"}]}]}";
        String base = "{\"opponentId\":\"" + b + "\",\"myScore\":8,\"opponentScore\":2,\"playedOn\":\""
                + java.time.LocalDate.now() + "\",\"scenarioCode\":\"MAGIC_STONES\"";
        // Faction items only for their faction: a Soga upgrade in an Oni list is rejected.
        mvc.perform(as(a, post("/api/games")).contentType(MediaType.APPLICATION_JSON)
                        .content(base + lists.replace("POUCH", "LUCKY_CHARM") + "}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ITEM_NOT_ALLOWED"));
        String id = json.readTree(mvc.perform(as(a, post("/api/games")).contentType(MediaType.APPLICATION_JSON)
                        .content(base + lists + "}")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(as(b, post("/api/games/" + id + "/confirm"))).andExpect(status().isNoContent());

        JsonNode mine = read(a, "/api/games/mine").get(0);
        assertThat(mine.get("listA").get("totalPoints").asInt()).isEqualTo(45 + 1 + 10);
        assertThat(mine.get("factionB").asText()).isEqualTo("HELIAN_LEAGUE");

        JsonNode stats = json.readTree(mvc.perform(get("/api/players/" + a)).andReturn().getResponse()
                .getContentAsString()).get("playStats");
        assertThat(stats.get("gamesWithList").asInt()).isEqualTo(1);
        assertThat(stats.get("topUnits").size()).isEqualTo(2);
        assertThat(stats.get("factionWins").get(0).get("key").asText()).isEqualTo("ONI_CLANS");
        assertThat(stats.get("winsAgainst").get(0).get("key").asText()).isEqualTo("HELIAN_LEAGUE");
        assertThat(stats.get("missions").get(0).get("key").asText()).isEqualTo("MAGIC_STONES");
        assertThat(stats.get("missionWins").get(0).get("count").asInt()).isEqualTo(1);
        JsonNode rival = json.readTree(mvc.perform(get("/api/players/" + b)).andReturn().getResponse()
                .getContentAsString()).get("playStats");
        assertThat(rival.get("nemesisUnits").size()).isEqualTo(2);
        assertThat(rival.get("factionLosses").get(0).get("key").asText()).isEqualTo("HELIAN_LEAGUE");
        // Lists stay private: the public profile has statistics only, the game list endpoint needs an account.
        mvc.perform(get("/api/games/mine")).andExpect(status().isUnauthorized());
    }

    @Test
    void roundPlanSetsScenarioPairingAndTables() throws Exception {
        UUID orga = user("Plan");
        String plan = "\"format\":\"SWISS\",\"roundsPlanned\":2,\"roundPlans\":["
                + "{\"number\":1,\"scenarioCode\":\"TREASURE_HUNT\",\"pairing\":\"RANDOM\",\"tableOrder\":\"RANDOM\"},"
                + "{\"number\":2,\"scenarioCode\":\"SUPPLY_RUN\",\"pairing\":\"RANDOM\",\"tableOrder\":\"BY_STANDINGS\"}]";
        mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON).content(
                        "{\"name\":\"Zly plan\",\"startsAt\":\"2030-10-10T08:00:00Z\",\"city\":\"Kraków\",\"rank\":\"LOCAL\","
                                + plan.replace("SUPPLY_RUN", "NO_SUCH_QUEST") + "}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SCENARIO_NOT_FOUND"));
        String base = tournament(orga, plan);
        assertThat(read(orga, base).get("roundPlans").size()).isEqualTo(2);
        players(base, 5);

        JsonNode r1 = playRound(orga, base);
        assertThat(r1.get("scenario").asText()).isEqualTo("TREASURE_HUNT");
        assertThat(r1.get("tableOrder").asText()).isEqualTo("RANDOM");
        // The BYE never takes a table in the middle: it is the last one.
        JsonNode m1 = r1.get("matches");
        assertThat(m1.get(m1.size() - 1).get("playerB").isNull()).isTrue();

        // After round 1 the organizer changes round 2 only; round 1 of the plan stays as it was.
        String id = base.substring(base.lastIndexOf('/') + 1);
        mvc.perform(as(orga, put(base)).contentType(MediaType.APPLICATION_JSON).content(
                        "{\"name\":\"Format test\",\"startsAt\":\"2030-10-10T08:00:00Z\",\"city\":\"Kraków\",\"rank\":\"LOCAL\","
                                + plan.replace("TREASURE_HUNT", "CLUE_TRAIL").replace("SUPPLY_RUN", "MAGIC_STONES") + "}"))
                .andExpect(status().isNoContent());
        JsonNode plans = read(orga, "/api/tournaments/" + id).get("roundPlans");
        assertThat(plans.get(0).get("scenarioCode").asText()).isEqualTo("TREASURE_HUNT");
        assertThat(plans.get(1).get("scenarioCode").asText()).isEqualTo("MAGIC_STONES");

        JsonNode r2 = playRound(orga, base);
        assertThat(r2.get("scenario").asText()).isEqualTo("MAGIC_STONES");
        assertThat(r2.get("tableOrder").asText()).isEqualTo("BY_STANDINGS");
        // Random pairing still avoids rematches.
        java.util.Set<String> firstRound = new java.util.HashSet<>();
        for (JsonNode m : m1) {
            if (!m.get("playerB").isNull()) {
                firstRound.add(pairKey(m));
            }
        }
        for (JsonNode m : r2.get("matches")) {
            if (!m.get("playerB").isNull()) {
                assertThat(firstRound).doesNotContain(pairKey(m));
            }
        }
    }

    private static String pairKey(JsonNode m) {
        String a = m.get("playerA").get("id").asText();
        String b = m.get("playerB").get("id").asText();
        return a.compareTo(b) < 0 ? a + b : b + a;
    }
}
