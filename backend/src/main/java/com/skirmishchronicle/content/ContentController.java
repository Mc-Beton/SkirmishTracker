package com.skirmishchronicle.content;

import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public, read-only game reference data. */
@RestController
@RequestMapping("/api/content")
public class ContentController {

    private final ContentService content;

    public ContentController(ContentService content) {
        this.content = content;
    }

    @GetMapping
    public ResponseEntity<GameContent> all() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic())
                .body(content.content());
    }

    @GetMapping("/armies")
    public ResponseEntity<ArmyContent> armies() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic())
                .body(content.armies());
    }
}
