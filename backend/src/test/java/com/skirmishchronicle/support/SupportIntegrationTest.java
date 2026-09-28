package com.skirmishchronicle.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/** Public contact form: stored for signed-out visitors, validated, bots caught by the honeypot. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class SupportIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    MockMvc mvc;

    @Autowired
    SupportRepository messages;

    private void send(String json, int expected) throws Exception {
        mvc.perform(post("/api/support").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expected));
    }

    @Test
    void anonymousMessageIsStoredAndValidated() throws Exception {
        long before = messages.count();
        send("""
                {"email":"fan@example.com","name":"Fan\\nX","topic":"QUESTION",
                 "message":"Czy mogę zorganizować ligę?","locale":"pl"}""", 204);
        assertThat(messages.count()).isEqualTo(before + 1);
        assertThat(messages.findAll()).anySatisfy(m -> {
            assertThat(m.getEmail()).isEqualTo("fan@example.com");
            assertThat(m.getName()).isEqualTo("Fan X");  // no line breaks
        });

        send("""
                {"email":"not-an-email","topic":"BUG","message":"Coś nie działa na stronie.","locale":"pl"}""", 400);
        send("""
                {"email":"fan@example.com","topic":"BUG","message":"za krótko","locale":"pl"}""", 400);
        assertThat(messages.count()).isEqualTo(before + 1);
    }

    @Test
    void honeypotIsAcceptedButIgnored() throws Exception {
        long before = messages.count();
        send("""
                {"email":"bot@example.com","topic":"OTHER","message":"Buy cheap things here now!",
                 "locale":"en","website":"http://spam.example"}""", 204);
        assertThat(messages.count()).isEqualTo(before);
    }
}
