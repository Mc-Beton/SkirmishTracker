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

/** Roster format: roster without a leader, a hidden party per game, scheme draw from the party's leader. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class RosterFlowIntegrationTest {

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

    // 23 + (18 + 1 + 1) + 32 + 22 + 15 = 112 of 125 – no leader in a roster.
    private static final String HELIAN_ROSTER = """
            {"faction":"HELIAN_LEAGUE","leaderInt":1,"units":[
              {"unit":"EXPEDITIONARY_HIEROPHANT"},
              {"unit":"CITADEL_GUARD","items":[{"item":"POUCH"},{"item":"POUCH"}]},
              {"unit":"AMAZON_GLADIATRIX"},{"unit":"PALADIN_OF_THE_ORDER"},{"unit":"FLAMESHAPER"}]}
            """;
    private static final String ONI_ROSTER = """
            {"faction":"ONI_CLANS","leaderInt":1,"units":[
              {"unit":"ONI_MARAUDER"},{"unit":"RED_RASETSU"},{"unit":"CHIYOHIME"}]}
            """;

    @Test
    void rosterPartyIsHiddenUntilTheGameIsOverAndDrivesTheSchemeDraw() throws Exception {
        UUID orga = user("Orga");
        UUID a = user("Aldric");
        UUID b = user("Brena");
        UUID outsider = user("Obcy");
        String create = """
                {"name":"Roster","startsAt":"2030-10-10T08:00:00Z","city":"Kraków","rank":"LOCAL","format":"SWISS",
                 "roundsPlanned":1,"listFormat":"ROSTER","pointsLimit":125,"partyLimit":85}
                """;
        mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                        .content(create.replace("\"partyLimit\":85", "\"partyLimit\":130")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PARTY_LIMIT_OVER_ROSTER"));
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                .content(create)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        String base = "/api/tournaments/" + id;
        JsonNode detail = read(orga, base);
        assertThat(detail.get("listFormat").asText()).isEqualTo("ROSTER");
        assertThat(detail.get("partyLimit").asInt()).isEqualTo(85);
        mvc.perform(as(orga, post(base + "/publish")));
        mvc.perform(as(a, post(base + "/registration")));
        mvc.perform(as(b, post(base + "/registration")));

        // Rosters have no leader – it is chosen for each game.
        mvc.perform(as(a, put(base + "/warbands/me")).contentType(MediaType.APPLICATION_JSON)
                        .content(HELIAN_ROSTER.replace("{\"unit\":\"FLAMESHAPER\"}", "{\"unit\":\"FLAMESHAPER\",\"leader\":true}")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ROSTER_HAS_NO_LEADER"));
        mvc.perform(as(a, put(base + "/warbands/me")).contentType(MediaType.APPLICATION_JSON).content(HELIAN_ROSTER))
                .andExpect(status().isOk());
        mvc.perform(as(b, put(base + "/warbands/me")).contentType(MediaType.APPLICATION_JSON).content(ONI_ROSTER))
                .andExpect(status().isOk());

        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        mvc.perform(as(orga, post(base + "/rounds/1/start")));
        String match = base + "/matches/" + read(a, base + "/rounds").get(0).get("matches").get(0).get("id").asText();

        // No party yet → no scheme draw.
        mvc.perform(as(a, post(match + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARTY_REQUIRED"));

        // A sees the opponent's faction and roster (rosters are not hidden in this event), no party yet.
        JsonNode party = read(a, match + "/party");
        assertThat(party.get("rosterFormat").asBoolean()).isTrue();
        assertThat(side(party, b).get("faction").asText()).isEqualTo("ONI_CLANS");
        assertThat(side(party, b).get("roster").size()).isEqualTo(3);
        assertThat(side(party, a).get("canEdit").asBoolean()).isTrue();
        assertThat(side(party, b).get("canEdit").asBoolean()).isFalse();

        // Over 85 points; then a valid party: Hierophant (leader) 23 + Guard with one pouch 19 + Paladin 22 = 64.
        mvc.perform(as(a, put(match + "/party")).contentType(MediaType.APPLICATION_JSON).content("""
                        {"units":[{"slot":0},{"slot":1,"items":[0,1]},{"slot":2},{"slot":3}],"leaderSlot":0,"leaderInt":9}
                        """))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PARTY_OVER_LIMIT"));
        mvc.perform(as(a, put(match + "/party")).contentType(MediaType.APPLICATION_JSON).content("""
                        {"units":[{"slot":0},{"slot":1,"items":[0]},{"slot":3}],"leaderSlot":0,"leaderInt":9}
                        """))
                .andExpect(status().isOk());
        assertThat(side(read(a, match + "/party"), a).get("party").get("totalPoints").asInt()).isEqualTo(64);
        // B may not set A's party.
        mvc.perform(as(b, put(match + "/party").param("userId", a.toString())).contentType(MediaType.APPLICATION_JSON)
                .content("{\"units\":[{\"slot\":0}],\"leaderSlot\":0,\"leaderInt\":9}")).andExpect(status().isConflict());

        // Hidden information: the opponent and outsiders only learn that A has chosen.
        JsonNode seenByB = side(read(b, match + "/party"), a);
        assertThat(seenByB.get("chosen").asBoolean()).isTrue();
        assertThat(seenByB.get("party").isNull()).isTrue();
        assertThat(side(read(outsider, match + "/party"), a).get("party").isNull()).isTrue();
        assertThat(side(read(orga, match + "/party"), a).get("party").get("totalPoints").asInt()).isEqualTo(64);

        // The draw uses the party leader's INT (9 → 2 cards); afterwards the party is locked.
        mvc.perform(as(a, post(match + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNoContent());
        JsonNode game = read(a, match + "/game");
        for (JsonNode p : game.get("players")) {
            if (p.get("userId").asText().equals(a.toString())) {
                assertThat(p.get("warbandLeaderInt").asInt()).isEqualTo(9);
                assertThat(p.get("draw").get("cards").size()).isEqualTo(2);
            }
        }
        mvc.perform(as(a, put(match + "/party")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"units\":[{\"slot\":0}],\"leaderSlot\":0,\"leaderInt\":9}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARTY_LOCKED"));

        // B: Chiyohime (leader) 45 + Marauder 25 = 70. After the confirmed result everyone sees both parties.
        mvc.perform(as(b, put(match + "/party")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"units\":[{\"slot\":2},{\"slot\":0}],\"leaderSlot\":2,\"leaderInt\":12}"))
                .andExpect(status().isOk());
        JsonNode m = read(a, base + "/rounds").get(0).get("matches").get(0);
        boolean aIsA = m.get("playerA").get("id").asText().equals(a.toString());
        mvc.perform(as(a, post(match + "/report")).contentType(MediaType.APPLICATION_JSON)
                .content(aIsA ? "{\"smallA\":7,\"smallB\":3}" : "{\"smallA\":3,\"smallB\":7}")).andExpect(status().isNoContent());
        assertThat(side(read(a, match + "/party"), b).get("party").isNull()).isTrue();   // reported, not confirmed
        mvc.perform(as(b, post(match + "/confirm"))).andExpect(status().isNoContent());
        JsonNode after = read(outsider, match + "/party");
        assertThat(after.get("revealed").asBoolean()).isTrue();
        assertThat(side(after, b).get("party").get("totalPoints").asInt()).isEqualTo(70);
        assertThat(side(after, a).get("party").get("units").size()).isEqualTo(3);
    }
}
