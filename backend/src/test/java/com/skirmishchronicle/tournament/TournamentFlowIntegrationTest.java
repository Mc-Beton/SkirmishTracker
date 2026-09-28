package com.skirmishchronicle.tournament;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.identity.service.JwtService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Tournament lifecycle, registration limits, waitlist promotion and organizer permissions. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class TournamentFlowIntegrationTest {

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

    private String bearer(String nick) {
        User user = new User(nick.toLowerCase() + "-" + UUID.randomUUID() + "@example.com",
                nick + UUID.randomUUID().toString().substring(0, 6), "pl");
        user.markEmailVerified();
        users.save(user);
        return "Bearer " + jwtService.issueAccessToken(user);
    }

    private String tournamentJson(int maxPlayers) {
        return """
                {"name":"Wojna w Thenion","description":"Opis","startsAt":"2030-10-10T08:00:00Z",
                 "city":"Kraków","rank":"LOCAL","format":"SWISS","maxPlayers":%d,"pointsLimit":350,
                 "entryFeeAmount":50,"roundsPlanned":3}
                """.formatted(maxPlayers);
    }

    private String createTournament(String organizer, int maxPlayers) throws Exception {
        String body = mvc.perform(post("/api/tournaments").with(csrf()).header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content(tournamentJson(maxPlayers)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asText();
    }

    @Test
    void fullRegistrationFlowWithWaitlist() throws Exception {
        String organizer = bearer("Orga");
        String p1 = bearer("Aldric");
        String p2 = bearer("Brena");
        String p3 = bearer("Cador");
        String id = createTournament(organizer, 2);

        // Draft is invisible to everyone but the organizer.
        mvc.perform(get("/api/tournaments/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/tournaments/" + id).header("Authorization", organizer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.canManage").value(true));
        // Registration only after publishing.
        mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p1))
                .andExpect(status().isConflict());

        // Only the organizer can publish.
        mvc.perform(post("/api/tournaments/" + id + "/publish").with(csrf()).header("Authorization", p1))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/tournaments/" + id + "/publish").with(csrf()).header("Authorization", organizer))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/tournaments/" + id)).andExpect(status().isOk());

        mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p1))
                .andExpect(jsonPath("$.status").value("REGISTERED"));
        mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p2))
                .andExpect(jsonPath("$.status").value("REGISTERED"));
        mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p3))
                .andExpect(jsonPath("$.status").value("WAITLIST"));
        mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p3))
                .andExpect(status().isConflict());

        // A registered player withdraws -> first on the waitlist moves up.
        mvc.perform(delete("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", p1))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/tournaments/" + id).header("Authorization", p3))
                .andExpect(jsonPath("$.myStatus").value("REGISTERED"))
                .andExpect(jsonPath("$.registeredCount").value(2))
                .andExpect(jsonPath("$.waitlistCount").value(0));

        // Public participant list hides payment / list review.
        mvc.perform(get("/api/tournaments/" + id + "/participants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].paid").value(nullValue()));

        JsonNode list = json.readTree(mvc.perform(get("/api/tournaments/" + id + "/participants")
                .header("Authorization", organizer)).andReturn().getResponse().getContentAsString());
        String participantId = list.get(0).get("id").asText();

        // Players cannot touch organizer functions.
        mvc.perform(patch("/api/tournaments/" + id + "/participants/" + participantId).with(csrf())
                        .header("Authorization", p2).contentType(MediaType.APPLICATION_JSON).content("{\"paid\":true}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/tournaments/" + id + "/participants/" + participantId).with(csrf())
                        .header("Authorization", organizer).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paid\":true,\"listStatus\":\"APPROVED\"}"))
                .andExpect(status().isNoContent());

        // IDOR: the participant cannot be reached through another tournament's URL, even by its organizer.
        String other = createTournament(organizer, 8);
        mvc.perform(delete("/api/tournaments/" + other + "/participants/" + participantId).with(csrf())
                        .header("Authorization", organizer))
                .andExpect(status().isNotFound());

        mvc.perform(delete("/api/tournaments/" + id + "/participants/" + participantId).with(csrf())
                        .header("Authorization", organizer))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/tournaments/" + id + "/audit").header("Authorization", organizer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("PLAYER_REMOVED"));
        mvc.perform(get("/api/tournaments/" + id + "/audit").header("Authorization", p2))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/tournaments").param("tab", "UPCOMING").param("city", "krak"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(greaterThanOrEqualTo(1)));
    }

    @Test
    void cannotShrinkPlayerLimitBelowRegisteredCount() throws Exception {
        String organizer = bearer("Orgb");
        String id = createTournament(organizer, 4);
        mvc.perform(post("/api/tournaments/" + id + "/publish").with(csrf()).header("Authorization", organizer));
        for (String nick : new String[] {"Dara", "Eryk", "Fenn"}) {
            mvc.perform(post("/api/tournaments/" + id + "/registration").with(csrf()).header("Authorization", bearer(nick)))
                    .andExpect(status().isOk());
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/tournaments/" + id)
                        .with(csrf()).header("Authorization", organizer)
                        .contentType(MediaType.APPLICATION_JSON).content(tournamentJson(2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MAX_PLAYERS_BELOW_REGISTERED"));
    }

    @Test
    void anonymousCannotCreate() throws Exception {
        mvc.perform(post("/api/tournaments").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(tournamentJson(8)))
                .andExpect(status().isUnauthorized());
    }
}
