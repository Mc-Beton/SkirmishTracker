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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

/** Team tournaments (teams, line-ups, team results), round timer, judge calls and notifications. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class TeamsAndTablesIntegrationTest {

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

    private MockHttpServletRequestBuilder jsonBody(MockHttpServletRequestBuilder req, String body) {
        return req.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private String tournament(UUID orga, String extra) throws Exception {
        String body = "{\"name\":\"Team test\",\"startsAt\":\"2030-10-10T08:00:00Z\",\"city\":\"Kraków\","
                + "\"rank\":\"LOCAL\"," + extra + "}";
        String id = json.readTree(mvc.perform(jsonBody(as(orga, post("/api/tournaments")), body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(as(orga, post("/api/tournaments/" + id + "/publish"))).andExpect(status().isNoContent());
        return "/api/tournaments/" + id;
    }

    /** Captain creates a team and invites (size - 1) players who accept. Returns [teamId, captain, members…]. */
    private List<UUID> team(String base, String name, int size) throws Exception {
        UUID captain = user("Cap");
        String teamId = json.readTree(mvc.perform(jsonBody(as(captain, post(base + "/teams")),
                "{\"name\":\"" + name + "\"}")).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString()).get("id").asText();
        List<UUID> out = new ArrayList<>(List.of(UUID.fromString(teamId), captain));
        for (int i = 1; i < size; i++) {
            UUID p = user("M" + i);
            mvc.perform(jsonBody(as(captain, post(base + "/teams/" + teamId + "/invite")),
                    "{\"userId\":\"" + p + "\"}")).andExpect(status().isNoContent());
            mvc.perform(as(p, post(base + "/teams/" + teamId + "/accept"))).andExpect(status().isNoContent());
            out.add(p);
        }
        return out;
    }

    private static List<String> types(JsonNode inbox) {
        List<String> out = new ArrayList<>();
        inbox.get("items").forEach(n -> out.add(n.get("type").asText()));
        return out;
    }

    @Test
    void teamSwissWithLineupsAndTeamStandings() throws Exception {
        UUID orga = user("Orga");
        String base = tournament(orga, "\"format\":\"SWISS\",\"roundsPlanned\":2,\"teamSize\":3");
        List<UUID> red = team(base, "Red", 3);
        List<UUID> blue = team(base, "Blue", 3);
        // A third team with two players only: pairing refuses to start.
        UUID lonelyCaptain = user("Lone");
        mvc.perform(jsonBody(as(lonelyCaptain, post(base + "/teams")), "{\"name\":\"Green\"}"))
                .andExpect(status().isCreated());
        mvc.perform(jsonBody(as(lonelyCaptain, post(base + "/teams")), "{\"name\":\"red\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_IN_TEAM"));
        // Individual registration is not possible in a team event.
        mvc.perform(as(user("Solo"), post(base + "/registration"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TEAM_TOURNAMENT"));
        // Invited players see the invitation; the captain was told about accepted ones.
        assertThat(types(read(red.get(1), "/api/notifications"))).contains("NEW_REGISTRATION");
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TEAM_INCOMPLETE"));
        String greenId = read(orga, base + "/teams").get("teams").get(2).get("id").asText();
        mvc.perform(as(orga, org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete(base + "/teams/" + greenId))).andExpect(status().isNoContent());

        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        // Before the start everyone sees the team pairing, but not the opponent's line-up or the board games.
        JsonNode r1 = read(red.get(1), base + "/rounds").get(0);
        assertThat(r1.get("matches").size()).isZero();
        JsonNode tm = r1.get("teamMatches").get(0);
        boolean redIsA = tm.get("teamA").get("id").asText().equals(red.get(0).toString());
        assertThat(tm.get(redIsA ? "lineupA" : "lineupB").size()).isEqualTo(3);
        assertThat(tm.get(redIsA ? "lineupB" : "lineupA").isNull()).isTrue();
        assertThat(tm.get(redIsA ? "canEditLineupA" : "canEditLineupB").asBoolean()).isTrue();
        assertThat(types(read(red.get(1), "/api/notifications"))).contains("LINEUP_REQUIRED");

        // Red's captain puts the third member on board 1.
        String lineup = "{\"teamId\":\"" + red.get(0) + "\",\"order\":[\"" + red.get(3) + "\",\"" + red.get(1)
                + "\",\"" + red.get(2) + "\"]}";
        String tmUrl = base + "/team-matches/" + tm.get("id").asText() + "/lineup";
        mvc.perform(jsonBody(as(blue.get(1), put(tmUrl)), lineup)).andExpect(status().isForbidden());
        mvc.perform(jsonBody(as(red.get(1), put(tmUrl)), "{\"teamId\":\"" + red.get(0) + "\",\"order\":[\""
                + red.get(1) + "\"]}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_LINEUP"));
        mvc.perform(jsonBody(as(red.get(1), put(tmUrl)), lineup)).andExpect(status().isNoContent());

        JsonNode round = read(orga, base + "/rounds").get(0);
        assertThat(round.get("matches").size()).isEqualTo(3);
        JsonNode board1 = round.get("matches").get(0);
        assertThat(board1.get("table").asInt()).isEqualTo(1);
        assertThat(List.of(board1.get("playerA").get("id").asText(), board1.get("playerB").get("id").asText()))
                .contains(red.get(3).toString(), blue.get(1).toString());

        mvc.perform(as(orga, post(base + "/rounds/1/start"))).andExpect(status().isNoContent());
        mvc.perform(jsonBody(as(red.get(1), put(tmUrl)), lineup)).andExpect(status().isConflict());
        // Red wins boards 1 and 2 by little, Blue wins board 3 by a lot: Red wins on game wins (2:1)
        // although Blue has more small points.
        int board = 0;
        for (JsonNode m : read(orga, base + "/rounds").get(0).get("matches")) {
            boolean redA = red.contains(UUID.fromString(m.get("playerA").get("id").asText()));
            int redScore = board < 2 ? 6 : 0;
            int blueScore = board < 2 ? 5 : 10;
            String score = redA ? "{\"type\":\"PLAYED\",\"smallA\":" + redScore + ",\"smallB\":" + blueScore + "}"
                    : "{\"type\":\"PLAYED\",\"smallA\":" + blueScore + ",\"smallB\":" + redScore + "}";
            mvc.perform(jsonBody(as(orga, put(base + "/matches/" + m.get("id").asText() + "/result")), score))
                    .andExpect(status().isNoContent());
            board++;
        }
        mvc.perform(as(orga, post(base + "/rounds/1/complete"))).andExpect(status().isNoContent());
        JsonNode done = read(orga, base + "/rounds").get(0).get("teamMatches").get(0);
        assertThat(done.get("complete").asBoolean()).isTrue();
        assertThat(done.get("winner").asText()).isEqualTo(red.get(0).toString());

        JsonNode standings = read(orga, base + "/team-standings");
        assertThat(standings.get(0).get("teamId").asText()).isEqualTo(red.get(0).toString());
        assertThat(standings.get(0).get("wins").asInt()).isEqualTo(1);
        assertThat(standings.get(0).get("gameWins").asInt()).isEqualTo(2);
        assertThat(standings.get(1).get("losses").asInt()).isEqualTo(1);
        // Public (anonymous) access to teams and team standings.
        mvc.perform(get(base + "/team-standings")).andExpect(status().isOk());
        mvc.perform(get(base + "/teams")).andExpect(status().isOk());
    }

    @Test
    void teamKnockoutDrawAdvancesHigherSeed() throws Exception {
        UUID orga = user("Orga");
        String base = tournament(orga, "\"format\":\"ELIMINATION\",\"teamSize\":2");
        List<UUID> a = team(base, "Alpha", 2);
        List<UUID> b = team(base, "Beta", 2);
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        mvc.perform(as(orga, post(base + "/rounds/1/start"))).andExpect(status().isNoContent());
        JsonNode round = read(orga, base + "/rounds").get(0);
        assertThat(round.get("stage").asText()).isEqualTo("FINAL");
        // Every board 5:5 → complete draw → the higher seed (team A of the bracket match) advances.
        for (JsonNode m : round.get("matches")) {
            mvc.perform(jsonBody(as(orga, put(base + "/matches/" + m.get("id").asText() + "/result")),
                    "{\"type\":\"PLAYED\",\"smallA\":5,\"smallB\":5}")).andExpect(status().isNoContent());
        }
        JsonNode tm = read(orga, base + "/rounds").get(0).get("teamMatches").get(0);
        assertThat(tm.get("seedA").asInt()).isEqualTo(1);
        assertThat(tm.get("winner").asText()).isEqualTo(tm.get("teamA").get("id").asText());
        mvc.perform(as(orga, post(base + "/rounds/1/complete"))).andExpect(status().isNoContent());
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALL_ROUNDS_PLAYED"));
        JsonNode standings = read(orga, base + "/team-standings");
        assertThat(standings.get(0).get("teamId").asText()).isEqualTo(tm.get("teamA").get("id").asText());
        assertThat(standings.get(0).get("draws").asInt()).isEqualTo(1);
        assertThat(standings.get(1).get("eliminated").asBoolean()).isTrue();
        assertThat(a).hasSize(3);
        assertThat(b).hasSize(3);
    }

    @Test
    void timerJudgeCallAndNotifications() throws Exception {
        UUID orga = user("Orga");
        String base = tournament(orga, "\"format\":\"SWISS\",\"roundsPlanned\":1,"
                + "\"roundPlans\":[{\"number\":1,\"tableOrder\":\"RANDOM\",\"durationMinutes\":90}]");
        UUID p1 = user("P1");
        UUID p2 = user("P2");
        mvc.perform(as(p1, post(base + "/registration"))).andExpect(status().isOk());
        mvc.perform(as(p2, post(base + "/registration"))).andExpect(status().isOk());
        assertThat(types(read(orga, "/api/notifications"))).contains("NEW_REGISTRATION");

        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        mvc.perform(as(orga, post(base + "/rounds/1/start"))).andExpect(status().isNoContent());
        JsonNode round = read(p1, base + "/rounds").get(0);
        assertThat(round.get("timer").get("totalSeconds").asInt()).isEqualTo(90 * 60);
        assertThat(round.get("timer").get("running").asBoolean()).isTrue();
        JsonNode inbox = read(p1, "/api/notifications");
        assertThat(types(inbox)).contains("ROUND_STARTED");
        assertThat(inbox.get("unread").asInt()).isPositive();

        mvc.perform(as(p1, post(base + "/rounds/1/timer/pause"))).andExpect(status().isForbidden());
        mvc.perform(as(orga, post(base + "/rounds/1/timer/pause"))).andExpect(status().isNoContent());
        mvc.perform(jsonBody(as(orga, post(base + "/rounds/1/timer/add")), "{\"minutes\":5}"))
                .andExpect(status().isNoContent());
        JsonNode timer = read(p1, base + "/rounds").get(0).get("timer");
        assertThat(timer.get("running").asBoolean()).isFalse();
        assertThat(timer.get("totalSeconds").asInt()).isEqualTo(95 * 60);

        String matchId = round.get("matches").get(0).get("id").asText();
        mvc.perform(as(user("Stranger"), post(base + "/matches/" + matchId + "/judge"))).andExpect(status().isForbidden());
        mvc.perform(jsonBody(as(p1, post(base + "/matches/" + matchId + "/judge")), "{\"note\":\"LoS?\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(p2, post(base + "/matches/" + matchId + "/judge"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JUDGE_ALREADY_CALLED"));
        assertThat(read(p1, base + "/rounds").get(0).get("matches").get(0).get("judgeCalled").asBoolean()).isTrue();
        assertThat(types(read(orga, "/api/notifications"))).contains("JUDGE_CALL");
        JsonNode calls = read(orga, base + "/judge-calls");
        assertThat(calls.size()).isEqualTo(1);
        mvc.perform(as(p1, get(base + "/judge-calls"))).andExpect(status().isForbidden());
        mvc.perform(as(orga, post(base + "/judge-calls/" + calls.get(0).get("id").asText() + "/resolve")))
                .andExpect(status().isNoContent());
        assertThat(read(p1, base + "/rounds").get(0).get("matches").get(0).get("judgeCalled").asBoolean()).isFalse();

        // Reporting a result; notifications can be marked read.
        mvc.perform(jsonBody(as(p1, post(base + "/matches/" + matchId + "/report")),
                "{\"smallA\":7,\"smallB\":3}")).andExpect(status().isNoContent());
        // p2 did not ask to confirm results: the entered result is final at once.
        JsonNode p2Inbox = read(p2, "/api/notifications");
        assertThat(types(p2Inbox)).contains("RESULT_RECORDED");
        assertThat(read(p1, base + "/rounds").get(0).get("matches").get(0).get("status").asText())
                .isEqualTo("CONFIRMED");
        String someId = p2Inbox.get("items").get(0).get("id").asText();
        mvc.perform(as(p1, post("/api/notifications/" + someId + "/read"))).andExpect(status().isNotFound());
        mvc.perform(as(p2, post("/api/notifications/read-all"))).andExpect(status().isNoContent());
        assertThat(read(p2, "/api/notifications").get("unread").asInt()).isZero();
    }
}
