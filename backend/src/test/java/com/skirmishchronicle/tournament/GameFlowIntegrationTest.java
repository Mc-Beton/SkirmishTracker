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
import java.util.HashSet;
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

/** Detailed game mode: scenario, scheme draw by leader INT, per-turn VP and finishing with the totals. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class GameFlowIntegrationTest {

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
        u.setConfirmResults(true);  // these flows test the confirm step
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

    @Test
    void contentIsPublic() throws Exception {
        mvc.perform(get("/api/content"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quests.length()").value(7))
                .andExpect(jsonPath("$.turns").value(5));
    }

    @Test
    void detailedGameFromSchemesToConfirmedResult() throws Exception {
        UUID orga = user("Orga");
        UUID a = user("Aldric");
        UUID b = user("Brena");
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Gra szczegółowa","startsAt":"2030-10-10T08:00:00Z","city":"Gdańsk",
                                 "rank":"LOCAL","format":"SWISS","roundsPlanned":1,"scoringMode":"DIFFERENCE_TABLE",
                                 "differenceTable":[{"upTo":0,"winner":10,"loser":10},{"upTo":3,"winner":12,"loser":8},
                                                    {"upTo":null,"winner":15,"loser":5}]}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String base = "/api/tournaments/" + id;
        mvc.perform(as(orga, post(base + "/publish")));
        mvc.perform(as(a, post(base + "/registration")));
        mvc.perform(as(b, post(base + "/registration")));
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        mvc.perform(as(orga, put(base + "/rounds/1/scenario")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scenarioCode\":\"MAGIC_STONES\"}")).andExpect(status().isNoContent());
        mvc.perform(as(orga, post(base + "/rounds/1/start")));

        String matchId = read(a, base + "/rounds").get(0).get("matches").get(0).get("id").asText();
        String game = base + "/matches/" + matchId;
        assertThat(read(a, base + "/rounds").get(0).get("scenario").asText()).isEqualTo("MAGIC_STONES");

        // Leader INT 14 → 3 different schemes; drawing twice is not allowed.
        mvc.perform(as(a, post(game + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"faction\":\"HELIAN_LEAGUE\",\"leaderInt\":14}")).andExpect(status().isNoContent());
        mvc.perform(as(a, post(game + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"faction\":\"HELIAN_LEAGUE\",\"leaderInt\":14}"))
                .andExpect(status().isConflict());
        JsonNode view = read(a, game + "/game");
        JsonNode myGame = view.get("players").get(0).get("userId").asText().equals(a.toString())
                ? view.get("players").get(0) : view.get("players").get(1);
        JsonNode cards = myGame.get("draw").get("cards");
        assertThat(cards.size()).isEqualTo(3);
        Set<String> distinct = new HashSet<>();
        cards.forEach(c -> distinct.add(c.get("scheme").asText()));
        assertThat(distinct).hasSize(3);
        mvc.perform(as(a, post(game + "/schemes/keep")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scheme\":\"" + cards.get(0).get("scheme").asText() + "\"}")).andExpect(status().isNoContent());

        // Turn scores: A 2+1 in turn 2 and 4+0 in turn 4 = 7; B 2 in turn 2 = 2.
        mvc.perform(as(a, put(game + "/turns/2")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"" + a + "\",\"scenarioVp\":2,\"schemeVp\":1}")).andExpect(status().isNoContent());
        mvc.perform(as(a, put(game + "/turns/4")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"" + a + "\",\"scenarioVp\":4,\"schemeVp\":0}")).andExpect(status().isNoContent());
        mvc.perform(as(b, put(game + "/turns/2")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"" + b + "\",\"scenarioVp\":2,\"schemeVp\":0}")).andExpect(status().isNoContent());
        // B may fill in A's turns too (players help each other); an outsider may not.
        mvc.perform(as(b, put(game + "/turns/3")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"" + a + "\",\"scenarioVp\":0,\"schemeVp\":0}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(user("Outsider"), put(game + "/turns/3")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerId\":\"" + a + "\",\"scenarioVp\":0,\"schemeVp\":0}"))
                .andExpect(status().isForbidden());
        // Correcting an earlier turn is allowed.
        mvc.perform(as(b, put(game + "/turns/1")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"playerId\":\"" + b + "\",\"scenarioVp\":0,\"schemeVp\":0}")).andExpect(status().isNoContent());

        mvc.perform(as(a, post(game + "/finish"))).andExpect(status().isNoContent());
        JsonNode match = read(b, base + "/rounds").get(0).get("matches").get(0);
        boolean aIsA = match.get("playerA").get("id").asText().equals(a.toString());
        assertThat(match.get("status").asText()).isEqualTo("REPORTED");
        assertThat(match.get(aIsA ? "smallA" : "smallB").asInt()).isEqualTo(7);
        assertThat(match.get(aIsA ? "smallB" : "smallA").asInt()).isEqualTo(2);
        mvc.perform(as(b, post(game + "/confirm"))).andExpect(status().isNoContent());

        // Difference 5 → last row of the table: 15 : 5.
        JsonNode standings = read(a, base + "/standings");
        assertThat(standings.get("rows").get(0).get("totalBigPoints").asInt()).isEqualTo(15);
        assertThat(standings.get("rows").get(1).get("totalBigPoints").asInt()).isEqualTo(5);
        // Confirmed game is locked for edits.
        mvc.perform(as(a, put(game + "/turns/5")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playerId\":\"" + a + "\",\"scenarioVp\":1,\"schemeVp\":0}"))
                .andExpect(status().isConflict());
    }
}
