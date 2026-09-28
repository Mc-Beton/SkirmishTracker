package com.skirmishchronicle.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.skirmishchronicle.identity.service.MailService;
import com.skirmishchronicle.identity.web.SessionCookies;
import jakarta.servlet.http.Cookie;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** End-to-end auth flow against a real PostgreSQL (requires Docker; skipped without it). */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class AuthFlowIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    MockMvc mvc;

    @MockitoBean
    MailService mailService;

    @Test
    void registerVerifyLoginRefreshAndDetectReuse() throws Exception {
        AtomicReference<String> verificationToken = new AtomicReference<>();
        doAnswer(inv -> {
            verificationToken.set(inv.getArgument(1));
            return null;
        }).when(mailService).sendVerification(any(), anyString());

        String register = """
                {"email":"Player@Example.com","displayName":"Aldric","password":"long enough passphrase","locale":"pl"}
                """;
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(register))
                .andExpect(status().isAccepted());
        assertThat(verificationToken.get()).isNotBlank();

        String login = """
                {"email":"player@example.com","password":"long enough passphrase"}
                """;
        // Unverified account cannot log in.
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));

        mvc.perform(post("/api/auth/verify-email").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + verificationToken.get() + "\"}"))
                .andExpect(status().isNoContent());

        MvcResult loggedIn = mvc.perform(post("/api/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isNoContent())
                .andReturn();
        Cookie access = loggedIn.getResponse().getCookie(SessionCookies.ACCESS_COOKIE);
        Cookie refresh = loggedIn.getResponse().getCookie(SessionCookies.REFRESH_COOKIE);
        assertThat(access).isNotNull();
        assertThat(access.isHttpOnly()).isTrue();
        assertThat(refresh).isNotNull();

        mvc.perform(get("/api/me").cookie(access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("player@example.com"))
                .andExpect(jsonPath("$.displayName").value("Aldric"));

        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());

        MvcResult refreshed = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(refresh))
                .andExpect(status().isNoContent())
                .andReturn();
        Cookie rotated = refreshed.getResponse().getCookie(SessionCookies.REFRESH_COOKIE);
        assertThat(rotated.getValue()).isNotEqualTo(refresh.getValue());

        // Replaying the old refresh token revokes the whole session family...
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(refresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("REFRESH_TOKEN_REUSED"));
        // ...so even the newest token no longer works.
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rotated))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void wrongPasswordIsRejectedWithGenericError() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@example.com\",\"password\":\"whatever-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void stateChangingRequestWithoutCsrfTokenIsRejected() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a@b.pl\",\"password\":\"x\"}"))
                .andExpect(status().isForbidden());
    }
}
