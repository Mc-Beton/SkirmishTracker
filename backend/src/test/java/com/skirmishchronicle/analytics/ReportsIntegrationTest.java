package com.skirmishchronicle.analytics;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Reports are for ADMIN and PUBLISHER only; filters are validated. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ReportsIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    MockMvc mvc;

    @Autowired
    UserRepository users;

    @Autowired
    JwtService jwtService;

    private String token(Role extra) {
        User u = new User("r" + UUID.randomUUID() + "@example.com", "R" + UUID.randomUUID().toString().substring(0, 8),
                "pl");
        u.markEmailVerified();
        if (extra != null) {
            u.getRoles().add(extra);
        }
        users.save(u);
        return "Bearer " + jwtService.issueAccessToken(u);
    }

    @Test
    void onlyAdminAndPublisherSeeReports() throws Exception {
        mvc.perform(get("/api/admin/reports/meta")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/reports/meta").header("Authorization", token(null)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/reports/meta").header("Authorization", token(Role.PUBLISHER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.report.summary.games").isNumber())
                .andExpect(jsonPath("$.report.thresholds.minPlayers").value(MetaStats.MIN_PLAYERS));
        mvc.perform(get("/api/admin/reports/meta").param("source", "TOURNAMENT").param("minElo", "1500")
                        .header("Authorization", token(Role.ADMIN)))
                .andExpect(status().isOk());
        // Publishers only read: other admin endpoints stay closed.
        mvc.perform(get("/api/admin/anything").with(csrf()).header("Authorization", token(Role.PUBLISHER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidFiltersAreRejected() throws Exception {
        String admin = token(Role.ADMIN);
        mvc.perform(get("/api/admin/reports/meta").param("source", "LEAGUE").header("Authorization", admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REPORT_FILTER"));
        mvc.perform(get("/api/admin/reports/meta").param("from", "2026-05-01").param("to", "2026-04-01")
                        .header("Authorization", admin))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/reports/meta").param("country", "Polska").header("Authorization", admin))
                .andExpect(status().isBadRequest());
    }
}
