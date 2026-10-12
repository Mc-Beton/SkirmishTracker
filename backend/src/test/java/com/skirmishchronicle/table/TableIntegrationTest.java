package com.skirmishchronicle.table;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Online table end to end: library (admin), maps (players), a game from invitation to undo rules. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class TableIntegrationTest {

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
    private final Map<UUID, String> names = new HashMap<>();

    private UUID user(String nick, Role extra) {
        String name = nick + UUID.randomUUID().toString().substring(0, 5);
        User u = new User(nick.toLowerCase() + UUID.randomUUID() + "@example.com", name, "pl");
        u.markEmailVerified();
        if (extra != null) {
            u.getRoles().add(extra);
        }
        users.save(u);
        tokens.put(u.getId(), "Bearer " + jwtService.issueAccessToken(u));
        names.put(u.getId(), name);
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
        return call(userId, post("/api/tables/" + tableId + "/commands"), body, status().isOk());
    }

    private String error(UUID userId, String tableId, String body) throws Exception {
        return call(userId, post("/api/tables/" + tableId + "/commands"), body, status().isConflict()).get("code").asText();
    }

    private static byte[] png() throws Exception {
        BufferedImage img = new BufferedImage(360, 360, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private String list(UUID userId, String body) throws Exception {
        return call(userId, post("/api/army-lists"), body, status().isCreated()).get("id").asText();
    }

    @Test
    void libraryMapsAndAGameWithUndoRules() throws Exception {
        UUID admin = user("Admin", Role.ADMIN);
        UUID a = user("Aldric", null);
        UUID b = user("Borvin", null);
        UUID judge = user("Judge", null);
        UUID fan = user("Fan", null);

        // ---- library: only admins upload and describe pieces; pictures are public
        mvc.perform(as(a, post("/api/admin/table/images")).content(png())).andExpect(status().isForbidden());
        mvc.perform(as(admin, post("/api/admin/table/images")).content("not an image".getBytes()))
                .andExpect(status().isBadRequest());
        String imageId = json.readTree(mvc.perform(as(admin, post("/api/admin/table/images")).content(png()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(get("/api/table/images/" + imageId)).andExpect(status().isOk());

        String bg = call(admin, post("/api/admin/table/backgrounds"), """
                {"name":"Plaża","imageId":"%s","widthIn":36,"heightIn":36,
                 "areas":[{"points":[{"x":0,"y":20},{"x":36,"y":20},{"x":36,"y":22},{"x":0,"y":22}],"height":0,"envs":["AQUATIC_SHALLOW"]}]}
                """.formatted(imageId), status().isCreated()).get("id").asText();
        String ruin = call(admin, post("/api/admin/table/terrain"), """
                {"name":"Ruina narożna","category":"RUIN","imageId":"%s","widthIn":6,"heightIn":6,
                 "shapes":[{"type":"WALL","points":[{"x":-3,"y":-3},{"x":3,"y":-3},{"x":3,"y":3}],"thickness":0.5,"height":3}]}
                """.formatted(imageId), status().isCreated()).get("id").asText();
        call(admin, post("/api/admin/table/terrain"), """
                {"name":"Zła","category":"RUIN","imageId":"%s","widthIn":6,"heightIn":6,
                 "shapes":[{"type":"WALL","points":[{"x":-3,"y":-3}],"thickness":0.5,"height":3}]}
                """.formatted(imageId), status().isBadRequest());

        // ---- maps: private by default, searchable by name or author when public
        String mapBody = """
                {"name":"Zatoka","backgroundId":"%s","placements":[{"assetId":"%s","x":18,"y":14,"rotation":0}],
                 "deploymentDepth":8,"isPublic":%s,"official":false}""";
        String privateMap = call(a, post("/api/table/maps"), mapBody.formatted(bg, ruin, "false"),
                status().isCreated()).get("id").asText();
        call(b, get("/api/table/maps/" + privateMap), null, status().isNotFound());
        call(a, post("/api/table/maps"), mapBody.formatted(bg, ruin, "true").replace("Zatoka", "Zatoka publiczna"), status().isCreated());
        assertThat(call(b, get("/api/table/maps?scope=PUBLIC&q=" + names.get(a).toLowerCase()), null, status().isOk()).size()).isEqualTo(1);
        assertThat(call(b, get("/api/table/maps?scope=PUBLIC&q=zatoka"), null, status().isOk()).size()).isEqualTo(1);
        call(a, post("/api/table/maps"), mapBody.formatted(bg, ruin, "true").replace("\"official\":false", "\"official\":true"),
                status().isForbidden());

        // ---- a game: A creates with a map and a list, B joins with the invitation
        String listA = list(a, """
                {"name":"Helian","format":"CLASSIC","list":{"faction":"HELIAN_LEAGUE","leaderInt":15,"units":[
                  {"unit":"EXPEDITIONARY_HIEROPHANT","leader":true},{"unit":"EONIAN_RUNNER"}]}}""");
        String listB = list(b, """
                {"name":"Oni","format":"CLASSIC","list":{"faction":"ONI_CLANS","leaderInt":10,"units":[
                  {"unit":"RED_RASETSU","leader":true},{"unit":"BLUE_YAKSHA"}]}}""");
        call(a, post("/api/tables"), "{\"mapId\":\"%s\",\"listId\":\"%s\"}".formatted(privateMap, listB), status().isNotFound());
        call(a, post("/api/tables"), "{\"mapId\":\"%s\",\"listId\":\"%s\",\"questCode\":\"NOPE\"}".formatted(privateMap, listA),
                status().isBadRequest());
        JsonNode created = call(a, post("/api/tables"),
                "{\"mapId\":\"%s\",\"listId\":\"%s\",\"questCode\":\"TREASURE_HUNT\",\"measureMode\":\"STANDARD\",\"judge\":true,\"observers\":true}"
                        .formatted(privateMap, listA),
                status().isCreated());
        String table = created.get("id").asText();
        call(b, get("/api/tables/" + table), null, status().isNotFound());
        call(b, post("/api/tables/join"), "{\"invite\":\"%s\",\"listId\":\"%s\"}".formatted(created.get("invite").asText(), listB),
                status().isOk());
        call(admin, post("/api/tables/join"), "{\"invite\":\"%s\",\"listId\":\"%s\"}".formatted(created.get("invite").asText(), listB),
                status().isNotFound());

        // ---- judge (one-time link, not a player) and observers (read-only)
        call(b, post("/api/tables/judge"), "{\"invite\":\"%s\"}".formatted(created.get("judgeInvite").asText()), status().isConflict());
        call(judge, post("/api/tables/judge"), "{\"invite\":\"%s\"}".formatted(created.get("judgeInvite").asText()), status().isOk());
        call(fan, post("/api/tables/judge"), "{\"invite\":\"%s\"}".formatted(created.get("judgeInvite").asText()), status().isNotFound());
        call(fan, get("/api/tables/" + table), null, status().isNotFound());
        call(fan, post("/api/tables/watch"), "{\"invite\":\"%s\"}".formatted(created.get("watchInvite").asText()), status().isOk());
        JsonNode watched = call(fan, get("/api/tables/" + table), null, status().isOk());
        assertThat(watched.get("role").asText()).isEqualTo("OBSERVER");
        assertThat(watched.get("measureMode").asText()).isEqualTo("STANDARD");
        assertThat(watched.get("judge").get("name").asText()).startsWith("Judge");
        call(fan, post("/api/tables/" + table + "/commands"), "{\"type\":\"ROLL\",\"count\":1}", status().isForbidden());
        call(b, post("/api/tables/" + table + "/observers"), "{\"allowed\":false}", status().isForbidden()); // creator only

        JsonNode view = call(b, get("/api/tables/" + table), null, status().isOk());
        assertThat(view.get("models").size()).isEqualTo(4);
        assertThat(view.get("you").asInt()).isEqualTo(1);
        assertThat(view.get("terrain").size()).isEqualTo(3); // river + two wall segments

        assertThat(view.get("questCode").asText()).isEqualTo("TREASURE_HUNT");
        assertThat(view.get("parties").size()).isEqualTo(2);

        // ---- schemes (server dice, Helian table, leader INT 15 = 3 cards) and quest tokens
        view = cmd(a, table, "{\"type\":\"DRAW_SCHEMES\"}");
        JsonNode drawn = view.get("parties").get(0).get("drawn");
        assertThat(drawn.size()).isEqualTo(3);
        assertThat(error(a, table, "{\"type\":\"DRAW_SCHEMES\"}")).isEqualTo("TABLE_SCHEMES_ALREADY_DRAWN");
        view = cmd(a, table, "{\"type\":\"KEEP_SCHEME\",\"scheme\":\"%s\"}".formatted(drawn.get(0).get("scheme").asText()));
        assertThat(view.get("parties").get(0).get("kept").asText()).isEqualTo(drawn.get(0).get("scheme").asText());
        view = cmd(b, table, "{\"type\":\"PLACE_TOKEN\",\"kind\":\"INTRIGUE\",\"x\":18,\"y\":18}");
        assertThat(view.get("tokens").size()).isEqualTo(1);

        // ---- setup
        assertThat(error(a, table, "{\"type\":\"DEPLOY\",\"id\":\"a1\",\"x\":10,\"y\":12,\"facing\":270}"))
                .isEqualTo("TABLE_OUTSIDE_DEPLOYMENT");
        cmd(a, table, "{\"type\":\"DEPLOY\",\"id\":\"a1\",\"x\":10,\"y\":33,\"facing\":270}");
        cmd(a, table, "{\"type\":\"DEPLOY\",\"id\":\"a2\",\"x\":20,\"y\":33,\"facing\":270}");
        cmd(b, table, "{\"type\":\"DEPLOY\",\"id\":\"b1\",\"x\":10,\"y\":3,\"facing\":90}");
        cmd(b, table, "{\"type\":\"DEPLOY\",\"id\":\"b2\",\"x\":20,\"y\":3,\"facing\":90}");
        cmd(a, table, "{\"type\":\"FIRST_PLAYER\",\"side\":0}");
        cmd(a, table, "{\"type\":\"READY\"}");
        view = cmd(b, table, "{\"type\":\"READY\"}");
        assertThat(view.get("status").asText()).isEqualTo("PLAYING");
        assertThat(view.get("game").get("active").asInt()).isZero();

        // ---- play: activation, limited move, opponent's reaction with dice blocks undo
        assertThat(error(b, table, "{\"type\":\"ACTIVATE\",\"id\":\"b1\"}")).isEqualTo("TABLE_NOT_YOUR_TURN");
        cmd(a, table, "{\"type\":\"ACTIVATE\",\"id\":\"a2\"}");
        view = cmd(a, table, "{\"type\":\"MOVE\",\"id\":\"a2\",\"mode\":\"WALK\",\"waypoints\":[{\"x\":20,\"y\":20}]}");
        JsonNode runner = view.get("models").get(1);
        assertThat(runner.get("y").asDouble()).isBetween(26.9, 27.1); // SPD 6
        assertThat(view.get("canUndo").asBoolean()).isTrue();
        cmd(b, table, "{\"type\":\"REACT\",\"id\":\"b2\"}");
        cmd(b, table, "{\"type\":\"ROLL\",\"label\":\"Attack\",\"id\":\"b2\",\"count\":3,\"target\":15}");
        assertThat(error(a, table, "{\"type\":\"UNDO\"}")).isEqualTo("TABLE_UNDO_AFTER_DICE");
        // the judge takes back the roll and the reaction (players cannot), then the players carry on
        view = cmd(judge, table, "{\"type\":\"UNDO\"}");
        assertThat(view.get("role").asText()).isEqualTo("JUDGE");
        view = cmd(judge, table, "{\"type\":\"UNDO\"}");
        assertThat(view.get("game").get("activation").get("id").asText()).isEqualTo("a2");
        cmd(judge, table, "{\"type\":\"FREE_MOVE\",\"id\":\"b1\",\"x\":12,\"y\":4,\"facing\":90}");
        assertThat(error(b, table, "{\"type\":\"UNDO\"}")).isEqualTo("TABLE_UNDO_ONLY_ACTIVE");
        assertThat(error(a, table, "{\"type\":\"UNDO\"}")).isEqualTo("TABLE_UNDO_AFTER_JUDGE");
        assertThat(call(fan, get("/api/tables/mine"), null, status().isOk()).get(0).get("role").asText()).isEqualTo("OBSERVER");
        call(a, post("/api/tables/" + table + "/observers"), "{\"allowed\":false}", status().isOk());
        call(fan, get("/api/tables/" + table), null, status().isNotFound());
        view = cmd(a, table, "{\"type\":\"HP\",\"id\":\"a2\",\"delta\":-2}");
        assertThat(view.get("models").get(1).get("states").toString()).contains("INCAPACITATED");
        view = cmd(a, table, "{\"type\":\"END_TURN\"}");
        assertThat(view.get("game").get("active").asInt()).isEqualTo(1);
        assertThat(view.get("log").size()).isGreaterThan(10);

        // ---- victory points and the end agreed by both
        cmd(b, table, "{\"type\":\"VP\",\"side\":1,\"round\":1,\"vpScenario\":2,\"vpScheme\":1}");
        cmd(b, table, "{\"type\":\"END_GAME\"}");
        view = cmd(a, table, "{\"type\":\"END_GAME\"}");
        assertThat(view.get("status").asText()).isEqualTo("FINISHED");
        assertThat(view.get("game").get("winner").asInt()).isEqualTo(1);
        assertThat(view.get("vpTotal").get(1).asInt()).isEqualTo(3);

        // ---- the result becomes an own game, waiting for the opponent's confirmation
        String gameId = call(b, post("/api/tables/" + table + "/report"), null, status().isOk()).get("gameId").asText();
        call(a, post("/api/tables/" + table + "/report"), null, status().isConflict());
        JsonNode games = call(a, get("/api/games/mine"), null, status().isOk());
        assertThat(games.toString()).contains(gameId);

        // a reported result stays: the judge cannot reopen the game any more
        assertThat(error(judge, table, "{\"type\":\"UNDO\"}")).isEqualTo("TABLE_ALREADY_REPORTED");
        call(b, post("/api/tables/" + table + "/commands"), "{\"type\":\"NOPE\"}", status().isBadRequest());
        assertThat(call(a, get("/api/tables/mine"), null, status().isOk()).get(0).get("status").asText()).isEqualTo("FINISHED");
    }
}
