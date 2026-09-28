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

/** Warband lists: validation against army lists and limit, visibility, locking and use in the scheme draw. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class WarbandFlowIntegrationTest {

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

    private static final String HELIAN_OK = """
            {"faction":"HELIAN_LEAGUE","leaderInt":14,"units":[
              {"unit":"EXPEDITIONARY_HIEROPHANT","leader":true},
              {"unit":"CITADEL_GUARD","extraPoints":5,"notes":"tarcza",
               "items":[{"item":"POUCH"},{"item":"POUCH"},{"item":"TACTICAL_EXPERTISE","reduced":true}]},
              {"unit":"AMAZON_GLADIATRIX"}]}
            """;

    private void putJson(UUID who, String url, String body, int expected) throws Exception {
        mvc.perform(as(who, put(url)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected));
    }

    @Test
    void armiesArePublic() throws Exception {
        mvc.perform(get("/api/content/armies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists.ADVENTURERS_GUILD.length()").value(14));
    }

    @Test
    void warbandValidationVisibilityAndSchemeDraw() throws Exception {
        UUID orga = user("Orga");
        UUID a = user("Aldric");
        UUID b = user("Brena");
        UUID outsider = user("Obcy");
        String id = json.readTree(mvc.perform(as(orga, post("/api/tournaments")).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Rozpiski","startsAt":"2030-10-10T08:00:00Z","city":"Kraków",
                                 "rank":"LOCAL","format":"SWISS","roundsPlanned":1,"pointsLimit":100,
                                 "listDeadline":"2030-10-01T00:00:00Z"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String base = "/api/tournaments/" + id;
        mvc.perform(as(orga, post(base + "/publish")));
        mvc.perform(as(a, post(base + "/registration")));
        mvc.perform(as(b, post(base + "/registration")));
        String me = base + "/warbands/me";

        // Only participants have a list.
        mvc.perform(as(outsider, get(me))).andExpect(status().isForbidden());
        putJson(outsider, me, HELIAN_OK, 403);

        // Own faction + Adventurers Guild: 23 + (18 + 5 + 1 + 1 + 3) + 32 = 83 of 100. Items may repeat;
        // "reduced" is ignored for items without a reduced cost.
        putJson(a, me, HELIAN_OK, 200);
        JsonNode mine = read(a, me);
        assertThat(mine.get("editable").asBoolean()).isTrue();
        assertThat(mine.get("warband").get("totalPoints").asInt()).isEqualTo(83);
        assertThat(mine.get("warband").get("listStatus").asText()).isEqualTo("SUBMITTED");
        assertThat(mine.get("warband").get("units").get(2).get("source").asText()).isEqualTo("ADVENTURERS_GUILD");
        assertThat(mine.get("warband").get("units").get(1).get("items").size()).isEqualTo(3);
        assertThat(mine.get("warband").get("units").get(1).get("totalPoints").asInt()).isEqualTo(28);

        // Over the limit, no leader, two leaders, ally not allowed for Helian, unknown unit.
        putJson(a, me, HELIAN_OK.replace("{\"unit\":\"AMAZON_GLADIATRIX\"}",
                "{\"unit\":\"AMAZON_GLADIATRIX\"},{\"unit\":\"ANARI_ERUDITE_PRODIGY\"}"), 400);
        putJson(a, me, HELIAN_OK.replace("\"leader\":true", "\"leader\":false"), 400);
        putJson(a, me, HELIAN_OK.replace("{\"unit\":\"AMAZON_GLADIATRIX\"}",
                "{\"unit\":\"AMAZON_GLADIATRIX\",\"leader\":true}"), 400);
        putJson(a, me, HELIAN_OK.replace("\"leaderInt\":14", "\"leaderInt\":14,\"alliedFaction\":\"UNDEAD\""), 400);
        putJson(a, me, HELIAN_OK.replace("CITADEL_GUARD", "ONI_MARAUDER"), 400);
        // Faction items only for their own faction (Soga upgrade in a Helian list).
        putJson(a, me, HELIAN_OK.replace("TACTICAL_EXPERTISE", "LUCKY_CHARM"), 400);

        // Oni may take Undead allies but not the Adventurers Guild; Undead is not playable alone.
        String oni = """
                {"faction":"ONI_CLANS","alliedFaction":"UNDEAD","leaderInt":12,"units":[
                  {"unit":"ONI_MARAUDER","leader":true},{"unit":"BONEWALKER"}]}
                """;
        putJson(b, me, oni.replace("BONEWALKER", "AMAZON_GLADIATRIX"), 400);
        putJson(b, me, oni.replace("\"faction\":\"ONI_CLANS\",\"alliedFaction\":\"UNDEAD\"",
                "\"faction\":\"UNDEAD\""), 400);
        putJson(b, me, oni, 200);

        // Before the deadline lists are hidden from other players and the public, but not from the organizer.
        mvc.perform(as(b, get(base + "/warbands/" + a))).andExpect(status().isForbidden());
        mvc.perform(get(base + "/warbands")).andExpect(status().isForbidden());
        assertThat(read(orga, base + "/warbands").size()).isEqualTo(2);
        // Players cannot edit someone else's list; the organizer can.
        putJson(b, base + "/warbands/" + a, oni, 403);
        putJson(orga, base + "/warbands/" + b, oni.replace("BONEWALKER", "FORGOTTEN_HERO"), 200);
        assertThat(read(b, me).get("warband").get("totalPoints").asInt()).isEqualTo(45);

        // After pairing round 1 the player's list is locked and becomes visible to everybody.
        mvc.perform(as(orga, post(base + "/rounds"))).andExpect(status().isCreated());
        putJson(a, me, HELIAN_OK, 409);
        assertThat(read(a, me).get("editable").asBoolean()).isFalse();
        mvc.perform(as(orga, post(base + "/rounds/1/start")));
        mvc.perform(as(b, get(base + "/warbands/" + a))).andExpect(status().isOk())
                .andExpect(jsonPath("$.faction").value("HELIAN_LEAGUE"));

        // Scheme draw takes faction and leader INT (14 → 3 cards) from the list.
        String matchId = read(a, base + "/rounds").get(0).get("matches").get(0).get("id").asText();
        String game = base + "/matches/" + matchId;
        mvc.perform(as(a, post(game + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isNoContent());
        // Oni Clans draw from the Monster Factions table; leader INT 12 → 2 cards.
        mvc.perform(as(b, post(game + "/schemes/draw")).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isNoContent());
        JsonNode view = read(a, game + "/game");
        JsonNode myGame = view.get("players").get(0).get("userId").asText().equals(a.toString())
                ? view.get("players").get(0) : view.get("players").get(1);
        assertThat(myGame.get("warbandFaction").asText()).isEqualTo("HELIAN_LEAGUE");
        assertThat(myGame.get("draw").get("faction").asText()).isEqualTo("HELIAN_LEAGUE");
        assertThat(myGame.get("draw").get("cards").size()).isEqualTo(3);
    }
}
