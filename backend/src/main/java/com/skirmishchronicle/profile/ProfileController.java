package com.skirmishchronicle.profile;

import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProfileController {

    private final ProfileService profiles;

    public ProfileController(ProfileService profiles) {
        this.profiles = profiles;
    }

    /** Signed-in users only (opponent picker for own games). */
    @GetMapping("/api/players/search")
    public List<ProfileService.SearchHit> search(@RequestParam(name = "q", defaultValue = "") String q) {
        return profiles.search(q.length() > 40 ? q.substring(0, 40) : q);
    }

    @GetMapping("/api/players/{id}")
    public ProfileService.Profile profile(@PathVariable UUID id) {
        return profiles.profile(id);
    }

    @GetMapping("/api/ranking")
    public List<ProfileService.RankingRow> ranking() {
        return profiles.ranking(200);
    }
}
