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
import java.util.HashSet;
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

/** Challenges, Swiss rounds, result reporting/confirmation and standings end to end. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class RoundFlowIntegrationTest {

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
    void challengeThenThreeSwissRounds() throws Exception {
        UUID orga = user("Orga");
        List<UUID> players = new ArrayList<>();
        for (String n : new String[] {"Aldric", "Brena", "Cador", "Dara", "Eryk"}) {
            players.add(user(n));
        }
        String body = """
                {"name":"Liga testowa","startsAt":"2030-10-10T08:00:00Z","city":"Gdańsk","rank":"LOCAL",
                 "format":"SWISS","roundsPlanned":3,"challengesEnabled":true,"challengesPublic":false,
                 "scoringMode":"WIN_DRAW_LOSS","winPoints":3,"drawPoints":1,"lossPoints":0,"byeBigPoints":3}
                """;
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String base = "/api/tournaments/" + id;
        mvc.perform(as(orga, post(base + "/publish"))).andExpect(status().isNoContent());
        for (UUID p : players) {
            mvc.perform(as(p, post(base + "/registration"))).andExpect(status().isOk());
        }

        // Aldric challenges Brena; Brena cannot challenge anyone until she answers.
        UUID a = players.get(0);
        UUID b = players.get(1);
        mvc.perform(as(a, post(base + "/challenges")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"challengedUserId\":\"" + b + "\"}")).andExpect(status().isNoContent());
        mvc.perform(as(a, post(base + "/challenges")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengedUserId\":\"" + players.get(2) + "\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OPEN_CHALLENGE_EXISTS"));
        mvc.perform(as(b, post(base + "/challenges")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengedUserId\":\"" + players.get(3) + "\"}"))
                .andExpect(status().isConflict());
        // Private challenges: an outsider does not see them.
        assertThat(read(players.get(4), base + "/challenges").size()).isZero();
        String challengeId = read(b, base + "/challenges").get(0).get("id").asText();
        mvc.perform(as(b, post(base + "/challenges/" + challengeId + "/accept"))).andExpect(status().isNoContent());

        Set<Set<UUID>> history = new HashSet<>();
        Set<UUID> byes = new HashSet<>();
        for (int round = 1; round <= 3; round++) {
            mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
            // Not visible to players before the start.
            assertThat(read(a, base + "/rounds").size()).isEqualTo(round - 1);
            mvc.perform(as(orga, post(base + "/rounds/" + round + "/start"))).andExpect(status().isNoContent());

            JsonNode matches = read(a, base + "/rounds").get(round - 1).get("matches");
            assertThat(matches.size()).isEqualTo(3);  // 2 games + 1 BYE
            for (JsonNode m : matches) {
                UUID pa = UUID.fromString(m.get("playerA").get("id").asText());
                if (m.get("playerB").isNull()) {
                    assertThat(byes.add(pa)).as("BYE only once").isTrue();
                    continue;
                }
                UUID pb = UUID.fromString(m.get("playerB").get("id").asText());
                assertThat(history.add(Set.of(pa, pb))).as("no rematch").isTrue();
                if (round == 1 && (pa.equals(a) || pa.equals(b))) {
                    assertThat(Set.of(pa, pb)).isEqualTo(Set.of(a, b));  // accepted challenge
                }
                String matchUrl = base + "/matches/" + m.get("id").asText();
                // A reports 7:3, B confirms.
                mvc.perform(as(pa, post(matchUrl + "/report")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smallA\":7,\"smallB\":3}")).andExpect(status().isNoContent());
                // Reporter cannot confirm own result; an outsider cannot touch it.
                mvc.perform(as(pa, post(matchUrl + "/confirm"))).andExpect(status().isConflict());
                mvc.perform(as(orga, post(matchUrl + "/confirm"))).andExpect(status().isForbidden());
                mvc.perform(as(pb, post(matchUrl + "/confirm"))).andExpect(status().isNoContent());
            }
            mvc.perform(as(orga, post(base + "/rounds/" + round + "/complete"))).andExpect(status().isNoContent());
        }
        // Planned rounds exhausted.
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isConflict());

        // Organizer corrects a result and adds a penalty; standings reflect both.
        JsonNode lastRound = read(orga, base + "/rounds").get(2).get("matches");
        JsonNode game = null;
        for (JsonNode m : lastRound) {
            if (!m.get("playerB").isNull()) {
                game = m;
                break;
            }
        }
        mvc.perform(as(orga, put(base + "/matches/" + game.get("id").asText() + "/result"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"SPLIT\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(orga, post(base + "/penalties")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"" + players.get(4) + "\",\"bigPoints\":2,\"reason\":\"Spóźnienie\"}"))
                .andExpect(status().isNoContent());

        JsonNode standings = read(players.get(0), base + "/standings");
        assertThat(standings.get("rows").size()).isEqualTo(5);
        int prevWins = Integer.MAX_VALUE;
        int prevBig = Integer.MAX_VALUE;
        for (JsonNode row : standings.get("rows")) {
            int wins = row.get("wins").asInt();
            int big = row.get("totalBigPoints").asInt();
            assertThat(wins <= prevWins).isTrue();
            if (wins == prevWins) {
                assertThat(big <= prevBig).isTrue();
            }
            prevWins = wins;
            prevBig = big;
        }
        assertThat(standings.get("penalties").get(0).get("bigPoints").asInt()).isEqualTo(2);

        mvc.perform(as(orga, post(base + "/finish"))).andExpect(status().isNoContent());
        mvc.perform(get(base)).andExpect(jsonPath("$.status").value("FINISHED"));
    }

    @Test
    void eloSeedingIsAcceptedWithGlobalRatings() throws Exception {
        UUID orga = user("Orgb");
        mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"ELO test","startsAt":"2030-10-10T08:00:00Z","city":"Gdańsk","rank":"LOCAL",
                 "format":"SWISS","firstRoundMode":"ELO_TOP_VS_BOTTOM"}
                """))
                .andExpect(status().isCreated());
    }
}
