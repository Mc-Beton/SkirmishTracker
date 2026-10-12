package com.skirmishchronicle.armylist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

/** "My lists" (saved lists copied into tournaments) and own games played turn by turn. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ArmyListAndLiveGameIntegrationTest {

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
        u.setConfirmResults(true);
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

    private JsonNode side(JsonNode party, UUID userId) {
        for (JsonNode s : party.get("sides")) {
            if (s.get("userId").asText().equals(userId.toString())) {
                return s;
            }
        }
        throw new AssertionError("no side for " + userId);
    }

    // Classic list: Hierophant (leader) 23 + Paladin 22 + Flameshaper 15 = 60.
    private static final String CLASSIC = """
            {"name":"Helian pod scenariusze","format":"CLASSIC","list":{"faction":"HELIAN_LEAGUE","leaderInt":9,"units":[
              {"unit":"EXPEDITIONARY_HIEROPHANT","leader":true},
              {"unit":"PALADIN_OF_THE_ORDER"},{"unit":"FLAMESHAPER"}]}}
            """;

    private String body(JsonNode node) throws Exception {
        return json.writeValueAsString(node);
    }

    @Test
    void savedListsAreNumberedPrivateAndCopiedIntoTournaments() throws Exception {
        UUID a = user("Aldric");
        UUID other = user("Obcy");
        UUID orga = user("Orga");

        // Same rules as tournament lists: a classic list needs a leader.
        mvc.perform(as(a, post("/api/army-lists")).contentType(MediaType.APPLICATION_JSON)
                        .content(CLASSIC.replace(",\"leader\":true", "")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WARBAND_LEADER_REQUIRED"));
        JsonNode first = json.readTree(mvc.perform(as(a, post("/api/army-lists")).contentType(MediaType.APPLICATION_JSON)
                .content(CLASSIC)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(first.get("number").asInt()).isEqualTo(1);
        assertThat(first.get("totalPoints").asInt()).isEqualTo(60);
        assertThat(first.get("name").asText()).isEqualTo("Helian pod scenariusze");
        String listId = first.get("id").asText();

        // A roster copy drops the leader and takes the next number.
        JsonNode roster = json.readTree(mvc.perform(as(a, post("/api/army-lists/" + listId + "/duplicate?format=ROSTER")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(roster.get("number").asInt()).isEqualTo(2);
        assertThat(roster.get("format").asText()).isEqualTo("ROSTER");
        assertThat(roster.get("units").findValuesAsText("leader")).containsOnly("false");
        assertThat(read(a, "/api/army-lists").size()).isEqualTo(2);

        // Private: nobody else sees or changes it.
        mvc.perform(as(other, get("/api/army-lists/" + listId))).andExpect(status().isNotFound());
        assertThat(read(other, "/api/army-lists").size()).isZero();

        // Copy into a tournament; the tournament list remembers where it came from.
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Klasyk","startsAt":"2030-10-10T08:00:00Z","city":"Kraków","rank":"LOCAL","format":"SWISS",
                         "roundsPlanned":1,"pointsLimit":85}
                        """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        String base = "/api/tournaments/" + id;
        mvc.perform(as(orga, post(base + "/publish")));
        mvc.perform(as(a, post(base + "/registration")));
        com.fasterxml.jackson.databind.node.ObjectNode wb = (com.fasterxml.jackson.databind.node.ObjectNode)
                json.readTree(CLASSIC).get("list");
        wb.put("sourceListId", UUID.randomUUID().toString());
        mvc.perform(as(a, put(base + "/warbands/me")).contentType(MediaType.APPLICATION_JSON).content(body(wb)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ARMY_LIST_NOT_FOUND"));
        wb.put("sourceListId", listId);
        mvc.perform(as(a, put(base + "/warbands/me")).contentType(MediaType.APPLICATION_JSON).content(body(wb)))
                .andExpect(status().isOk());
        JsonNode mine = read(a, base + "/warbands/me");
        assertThat(mine.get("sourceList").get("number").asInt()).isEqualTo(1);

        // Editing the saved list does not touch the tournament copy; deleting it only clears the mark.
        mvc.perform(as(a, put("/api/army-lists/" + listId)).contentType(MediaType.APPLICATION_JSON)
                        .content(CLASSIC.replace("{\"unit\":\"FLAMESHAPER\"}", "{\"unit\":\"FLAMESHAPER\"},{\"unit\":\"AMAZON_GLADIATRIX\"}")))
                .andExpect(status().isOk());
        assertThat(read(a, base + "/warbands/me").get("warband").get("totalPoints").asInt()).isEqualTo(60);
        mvc.perform(as(a, delete("/api/army-lists/" + listId))).andExpect(status().isNoContent());
        mine = read(a, base + "/warbands/me");
        assertThat(mine.get("sourceList").isNull()).isTrue();
        assertThat(mine.get("warband").get("units").size()).isEqualTo(3);
    }

    @Test
    void ownGamePlayedTurnByTurnIsReportedWhenFinished() throws Exception {
        UUID a = user("Aldric");
        UUID b = user("Brena");
        UUID outsider = user("Obcy");
        String start = """
                {"opponentId":"%s","playedOn":"%s","myFaction":"HELIAN_LEAGUE","opponentFaction":"ONI_CLANS"}
                """.formatted(b, java.time.LocalDate.now());
        String id = json.readTree(mvc.perform(as(a, post("/api/games/live")).contentType(MediaType.APPLICATION_JSON)
                .content(start)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        String game = "/api/games/" + id;
        mvc.perform(as(outsider, get(game))).andExpect(status().isNotFound());
        JsonNode view = read(b, game);
        assertThat(view.get("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(view.get("canFinish").asBoolean()).isTrue();

        // Both players enter points for either side.
        mvc.perform(as(a, put(game + "/turns/1")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"%s\",\"scenarioVp\":2,\"schemeVp\":1}".formatted(a)))
                .andExpect(status().isNoContent());
        mvc.perform(as(b, put(game + "/turns/1")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"%s\",\"scenarioVp\":1,\"schemeVp\":0}".formatted(b)))
                .andExpect(status().isNoContent());
        mvc.perform(as(b, put(game + "/turns/2")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"%s\",\"scenarioVp\":3,\"schemeVp\":0}".formatted(a)))
                .andExpect(status().isNoContent());
        mvc.perform(as(outsider, put(game + "/turns/2")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerId\":\"%s\",\"scenarioVp\":3,\"schemeVp\":0}".formatted(a)))
                .andExpect(status().isNotFound());
        // Not counted while being played.
        assertThat(read(a, "/api/players/" + a).toString()).doesNotContain(id);

        // B finishes: 6 : 1 reported by B, so A confirms.
        mvc.perform(as(b, post(game + "/finish"))).andExpect(status().isNoContent());
        view = read(a, game);
        assertThat(view.get("status").asText()).isEqualTo("PENDING");
        assertThat(view.get("smallA").asInt()).isEqualTo(6);
        assertThat(view.get("smallB").asInt()).isEqualTo(1);
        assertThat(view.get("canConfirm").asBoolean()).isTrue();
        mvc.perform(as(b, post(game + "/confirm"))).andExpect(status().isForbidden());
        mvc.perform(as(a, put(game + "/turns/3")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerId\":\"%s\",\"scenarioVp\":3,\"schemeVp\":0}".formatted(a)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GAME_NOT_IN_PROGRESS"));

        // Back to the table for a forgotten turn, finish again, confirm.
        mvc.perform(as(a, post(game + "/reopen"))).andExpect(status().isNoContent());
        mvc.perform(as(a, put(game + "/turns/3")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"%s\",\"scenarioVp\":0,\"schemeVp\":2}".formatted(b)))
                .andExpect(status().isNoContent());
        mvc.perform(as(a, post(game + "/finish"))).andExpect(status().isNoContent());
        mvc.perform(as(a, post(game + "/confirm"))).andExpect(status().isForbidden());
        mvc.perform(as(b, post(game + "/confirm"))).andExpect(status().isNoContent());
        view = read(a, game);
        assertThat(view.get("status").asText()).isEqualTo("CONFIRMED");
        assertThat(view.get("smallB").asInt()).isEqualTo(3);

        // A game reported with the final score has no turns to reopen; a game being played can be abandoned.
        String started = json.readTree(mvc.perform(as(b, post("/api/games/live")).contentType(MediaType.APPLICATION_JSON)
                .content(start.replace(b.toString(), a.toString()))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(as(a, delete("/api/games/" + started))).andExpect(status().isNoContent());
        mvc.perform(as(a, get("/api/games/" + started))).andExpect(status().isNotFound());
    }
}
