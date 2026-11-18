package com.skirmishchronicle.table.play;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.skirmishchronicle.common.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Talks to the rules service (rules/): the game engine that decides what a command does. Internal network only.
 * A rule that refuses a command comes back as a 409 for the player, with the engine's own sentence.
 */
@Component
public class RulesClient {

    /** The service has no (current) copy of the table: send the whole log with the request. */
    public static class NeedLog extends RuntimeException {
    }

    private static final Logger log = LoggerFactory.getLogger(RulesClient.class);

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final ObjectMapper json;
    private final String url;
    private final String key;

    public RulesClient(ObjectMapper json, @Value("${app.rules-url:http://localhost:8090}") String url,
                       @Value("${app.rules-key:}") String key) {
        this.json = json;
        this.url = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        this.key = key == null ? "" : key;
    }

    public JsonNode post(String path, JsonNode body) {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url + path)).timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        if (!key.isEmpty()) {
            req.header("X-Rules-Key", key);
        }
        HttpResponse<String> res;
        try {
            res = http.send(req.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            log.warn("Rules service unreachable at {}: {}", url, e.toString());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "TABLE_RULES_UNAVAILABLE");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "TABLE_RULES_UNAVAILABLE");
        }
        JsonNode answer;
        try {
            answer = json.readTree(res.body());
        } catch (IOException e) {
            log.warn("Rules service answered {} with a body that is not JSON", res.statusCode());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "TABLE_RULES_UNAVAILABLE");
        }
        switch (res.statusCode()) {
            case 200:
                return answer;
            case 409:
                throw new NeedLog();
            case 422:
                // a rule of the game: the code is the engine's, the sentence is shown to the player
                throw new ApiException(HttpStatus.CONFLICT, "TABLE_RULE", answer.path("message").asText(null));
            case 400:
                log.warn("Rules service refused the request: {}", answer.path("message").asText());
                throw new ApiException(HttpStatus.BAD_REQUEST, "TABLE_BAD_COMMAND");
            default:
                log.warn("Rules service answered {}", res.statusCode());
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "TABLE_RULES_UNAVAILABLE");
        }
    }
}
