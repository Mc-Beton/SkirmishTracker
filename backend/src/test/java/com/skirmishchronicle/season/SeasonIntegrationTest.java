package com.skirmishchronicle.season;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.identity.domain.Role;
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

/** Seasons are public to read; creating them and marking tournaments official needs ADMIN or PUBLISHER. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class SeasonIntegrationTest {

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

    private String token(Role extra) {
        User u = new User("s" + UUID.randomUUID() + "@example.com", "S" + UUID.randomUUID().toString().substring(0, 8),
                "pl");
        u.markEmailVerified();
        if (extra != null) {
            u.getRoles().add(extra);
        }
        users.save(u);
        return "Bearer " + jwtService.issueAccessToken(u);
    }

    private static final String SEASON = """
            {"name":"Sezon testowy","startsOn":"2026-01-01","endsOn":"2026-12-31","pointsLocal":100,
             "pointsMaster":200,"pointsInternational":400,"bestResults":4}""";

    @Test
    void publisherManagesSeasonsAndEveryoneReadsThem() throws Exception {
        mvc.perform(post("/api/admin/seasons").with(csrf()).header("Authorization", token(null))
                        .contentType(MediaType.APPLICATION_JSON).content(SEASON))
                .andExpect(status().isForbidden());
        String body = mvc.perform(post("/api/admin/seasons").with(csrf()).header("Authorization", token(Role.PUBLISHER))
                        .contentType(MediaType.APPLICATION_JSON).content(SEASON))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode created = json.readTree(body);
        String id = created.get("id").asText();
        mvc.perform(get("/api/seasons")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=='" + id + "')]").exists());
        mvc.perform(get("/api/seasons/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.season.name").value("Sezon testowy"))
                .andExpect(jsonPath("$.ranking").isArray());
        mvc.perform(get("/api/admin/official/tournaments").param("from", "2026-01-01").param("to", "2026-12-31")
                        .header("Authorization", token(Role.PUBLISHER)))
                .andExpect(status().isOk());
    }

    @Test
    void invalidSeasonAndUnknownTournamentAreRejected() throws Exception {
        String admin = token(Role.ADMIN);
        mvc.perform(post("/api/admin/seasons").with(csrf()).header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content(SEASON.replace("2026-12-31", "2025-12-31")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_SEASON"));
        mvc.perform(put("/api/admin/official/tournaments/" + UUID.randomUUID()).with(csrf()).header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"official\":true}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/seasons/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }
}
