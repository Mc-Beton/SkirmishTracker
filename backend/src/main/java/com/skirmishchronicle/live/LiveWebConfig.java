package com.skirmishchronicle.live;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class LiveWebConfig implements WebMvcConfigurer {

    private final TournamentChangeInterceptor tournamentChanges;

    public LiveWebConfig(TournamentChangeInterceptor tournamentChanges) {
        this.tournamentChanges = tournamentChanges;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tournamentChanges).addPathPatterns("/api/tournaments/**");
    }
}
