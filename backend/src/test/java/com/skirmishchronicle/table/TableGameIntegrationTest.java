package com.skirmishchronicle.table;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.identity.domain.Role;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.repo.UserRepository;
import com.skirmishchronicle.identity.service.JwtService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * A table of the game engine end to end: created from a map and a saved list, joined, Schemes kept secret,
 * a refused move, the start of the game, conceding and the result report. Needs the rules service on
 * localhost:8090 ({@code npm start} in rules/); without it the test is skipped. CI starts the service.
 */
@SpringBootTest(properties = {"app.table-engine=GAME", "app.rules-url=http://localhost:8090", "app.rules-key="})
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class TableGameIntegrationTest {

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

    private static boolean rulesServiceUp() {
        try {
            HttpResponse<String> res = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build().send(
                    HttpRequest.newBuilder(URI.create("http://localhost:8090/health")).timeout(Duration.ofSeconds(2)).build(),
                    HttpResponse.BodyHandlers.ofString());
            return res.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private UUID user(String nick, Role extra) {
        User u = new User(nick.toLowerCase() + UUID.randomUUID() + "@example.com", nick + UUID.randomUUID().toString().substring(0, 5), "pl");
        u.markEmailVerified();
        if (extra != null) {
            u.getRoles().add(extra);
        }
        users.save(u);
        tokens.put(u.getId(), "Bearer " + jwtService.issueAccessToken(u));
        return u.getId();
    }

    private MockHttpServletRequestBuilder as(UUID userId, MockHttpServletRequestBuilder req) {
        return req.with(csrf()).header("Authorization", tokens.get(userId));
    }

    private JsonNode call(UUID userId, MockHttpServletRequestBuilder req, String body, ResultMatcher expect) throws Exception {
        if (body != null) {
            req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        String out = mvc.perform(as(userId, req)).andExpect(expect).andReturn().getResponse().getContentAsString();
        return out.isEmpty() ? null : json.readTree(out);
    }

    private JsonNode cmd(UUID userId, String tableId, String body) throws Exception {
        return call(userId, post("/api/tables/" + tableId + "/game/commands"), body, status().isOk());
    }

    private static byte[] png() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(360, 360, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    @Test
    void aGameOfTheGameEngineFromListsToTheResult() throws Exception {
        assumeTrue(rulesServiceUp(), "rules service is not running on localhost:8090");
        UUID admin = user("Admin", Role.ADMIN);
        UUID a = user("Aldric", null);
        UUID b = user("Borvin", null);
        UUID fan = user("Fan", null);

        String imageId = json.readTree(mvc.perform(as(admin, post("/api/admin/table/images")).content(png()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String bg = call(admin, post("/api/admin/table/backgrounds"), """
                {"name":"Meadow","imageId":"%s","widthIn":36,"heightIn":36,
                 "areas":[{"points":[{"x":0,"y":17},{"x":36,"y":17},{"x":36,"y":19},{"x":0,"y":19}],"height":0,"envs":["AQUATIC_SHALLOW"]}]}
                """.formatted(imageId), status().isCreated()).get("id").asText();
        String ruin = call(admin, post("/api/admin/table/terrain"), """
                {"name":"Ruin","category":"RUIN","imageId":"%s","widthIn":6,"heightIn":6,
                 "shapes":[{"type":"WALL","points":[{"x":-3,"y":-3},{"x":3,"y":-3},{"x":3,"y":3}],"thickness":0.5,"height":3}]}
                """.formatted(imageId), status().isCreated()).get("id").asText();
        String map = call(a, post("/api/table/maps"), """
                {"name":"Ford","backgroundId":"%s","placements":[{"assetId":"%s","x":18,"y":14,"rotation":0}],
                 "deploymentDepth":8,"isPublic":false,"official":false}""".formatted(bg, ruin), status().isCreated()).get("id").asText();
        String listA = call(a, post("/api/army-lists"), """
                {"name":"Helian","format":"CLASSIC","list":{"faction":"HELIAN_LEAGUE","leaderInt":15,"units":[
                  {"unit":"EXPEDITIONARY_HIEROPHANT","leader":true},{"unit":"EONIAN_RUNNER"}]}}""", status().isCreated()).get("id").asText();
        String listB = call(b, post("/api/army-lists"), """
                {"name":"Oni","format":"CLASSIC","list":{"faction":"ONI_CLANS","leaderInt":10,"units":[
                  {"unit":"RED_RASETSU","leader":true},{"unit":"BLUE_YAKSHA"}]}}""", status().isCreated()).get("id").asText();

        // ---- A creates the table: the engine deploys the list, the creator sits in the first seat
        JsonNode created = call(a, post("/api/tables"), "{\"mapId\":\"%s\",\"listId\":\"%s\",\"questCode\":\"TREASURE_HUNT\"}"
                .formatted(map, listA), status().isCreated());
        String table = created.get("id").asText();
        assertThat(call(a, get("/api/tables/" + table + "/engine"), null, status().isOk()).get("engine").asText()).isEqualTo("GAME");
        assertThat(call(a, get("/api/tables/" + table), null, status().isConflict()).get("code").asText()).isEqualTo("TABLE_OTHER_ENGINE");
        call(fan, get("/api/tables/" + table + "/game"), null, status().isNotFound());
        call(fan, post("/api/tables/" + table + "/game/commands"), "{\"type\":\"READY\"}", status().isNotFound());

        JsonNode game = call(a, get("/api/tables/" + table + "/game"), null, status().isOk());
        assertThat(game.get("meta").get("status").asText()).isEqualTo("WAITING");
        assertThat(game.get("meta").get("you").asInt()).isZero();
        JsonNode events = game.get("events");
        assertThat(events.get(0).get("type").asText()).isEqualTo("TABLE_CREATED");
        assertThat(events.get(0).get("quest").asText()).isEqualTo("treasure-hunt");
        // the wall of the map and its shallow water came through as the engine's terrain
        assertThat(events.get(0).get("terrain").toString()).contains("\"obstacle\"").contains("\"water\"");
        assertThat(events.get(events.size() - 1).get("type").asText()).isEqualTo("PLAYER_JOINED");
        long seq = game.get("seq").asLong();
        assertThat(seq).isEqualTo(events.size());
        String modelA = null;
        for (JsonNode ev : events) {
            if ("MODEL_ADDED".equals(ev.get("type").asText())) {
                modelA = ev.get("model").get("id").asText();
            }
        }
        assertThat(modelA).isNotNull();

        // ---- B joins with the invitation and a list; only the new events are fetched
        call(b, post("/api/tables/join"), "{\"invite\":\"%s\",\"listId\":\"%s\"}".formatted(created.get("invite").asText(), listB), status().isOk());
        JsonNode more = call(b, get("/api/tables/" + table + "/game?after=" + seq), null, status().isOk());
        assertThat(more.get("meta").get("status").asText()).isEqualTo("SETUP");
        assertThat(more.get("meta").get("you").asInt()).isEqualTo(1);
        assertThat(more.get("events").get(0).get("seq").asLong()).isEqualTo(seq + 1);
        assertThat(more.get("events").toString()).contains("PARTY_DEPLOYED").contains("Oni Clans");

        // ---- Schemes: the cards go to their owner only, the events only count them
        cmd(a, table, "{\"type\":\"DRAW_SCHEMES\"}");
        JsonNode mine = call(a, get("/api/tables/" + table + "/game?after=999999"), null, status().isOk()).get("hands");
        assertThat(mine.get(0).get("options").size()).isGreaterThanOrEqualTo(2);
        assertThat(mine.get(1).isNull()).isTrue();
        JsonNode theirs = call(b, get("/api/tables/" + table + "/game"), null, status().isOk());
        assertThat(theirs.get("hands").get(0).isNull()).isTrue();
        assertThat(theirs.get("events").toString()).doesNotContain(mine.get(0).get("options").get(0).asText());
        cmd(a, table, "{\"type\":\"KEEP_SCHEME\",\"code\":\"%s\"}".formatted(mine.get(0).get("options").get(0).asText()));

        // ---- a rule refuses: B cannot move A's model; the engine's sentence comes with the error
        JsonNode refused = call(b, post("/api/tables/" + table + "/game/commands"),
                "{\"type\":\"MOVE_MODEL\",\"id\":\"%s\",\"x\":10,\"y\":30}".formatted(modelA), status().isConflict());
        assertThat(refused.get("code").asText()).isEqualTo("TABLE_RULE");
        assertThat(refused.get("message").asText()).isNotBlank();
        call(a, post("/api/tables/" + table + "/game/commands"), "[1,2]", status().isBadRequest());
        // the commands of the first engine do not reach a table of the game engine
        call(a, post("/api/tables/" + table + "/commands"), "{\"type\":\"READY\"}", status().isConflict());

        // ---- both ready: the Initiative Check is rolled, the game starts
        cmd(a, table, "{\"type\":\"READY\"}");
        cmd(b, table, "{\"type\":\"READY\"}");
        // both ready: each player rolls their die of the Initiative Check
        cmd(a, table, "{\"type\":\"ROLL_INITIATIVE\"}");
        cmd(b, table, "{\"type\":\"ROLL_INITIATIVE\"}");
        JsonNode playing = call(a, get("/api/tables/" + table + "/game"), null, status().isOk());
        assertThat(playing.get("meta").get("status").asText()).isEqualTo("PLAYING");
        assertThat(playing.get("events").toString()).contains("GAME_STARTED").contains("TURN_STARTED");
        call(a, post("/api/tables/" + table + "/report"), null, status().isConflict());

        // ---- B gives up; A reports the result as an own game; the table is closed for good
        cmd(b, table, "{\"type\":\"CONCEDE\"}");
        JsonNode over = call(a, get("/api/tables/" + table + "/game"), null, status().isOk());
        assertThat(over.get("meta").get("status").asText()).isEqualTo("FINISHED");
        assertThat(over.get("events").toString()).contains("GAME_FINISHED").contains("SCHEME_REVEALED");
        assertThat(call(a, post("/api/tables/" + table + "/report"), null, status().isOk()).get("gameId").asText()).isNotBlank();
        call(b, post("/api/tables/" + table + "/report"), null, status().isConflict());
        assertThat(call(a, post("/api/tables/" + table + "/game/commands"), "{\"type\":\"ADD_VP\",\"side\":0,\"delta\":1}",
                status().isConflict()).get("code").asText()).isEqualTo("TABLE_ALREADY_REPORTED");
    }
}
