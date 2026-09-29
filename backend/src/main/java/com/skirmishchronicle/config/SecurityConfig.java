package com.skirmishchronicle.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.skirmishchronicle.identity.oauth.OAuthLoginSuccessHandler;
import com.skirmishchronicle.identity.service.JwtService;
import com.skirmishchronicle.identity.web.SessionCookies;
import jakarta.servlet.DispatcherType;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
public class SecurityConfig {

    private final AppProperties props;

    public SecurityConfig(AppProperties props) {
        this.props = props;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            ObjectProvider<ClientRegistrationRepository> oauthClients,
                                            OAuthLoginSuccessHandler oauthSuccessHandler) throws Exception {
        http
                // Cookies carry the session, so CSRF protection stays on (double-submit cookie for the SPA).
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                // Authentication is never stored in the HTTP session; every request presents its JWT cookie.
                .securityContext(c -> c.securityContextRepository(new RequestAttributeSecurityContextRepository()))
                .authorizeHttpRequests(auth -> auth
                        // Async dispatches only finish a request that was already authorized (SSE stream).
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .requestMatchers("/actuator/health", "/error").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login",
                                "/api/auth/refresh", "/api/auth/logout", "/api/auth/verify-email",
                                "/api/auth/resend-verification", "/api/auth/forgot-password",
                                "/api/auth/reset-password", "/api/support").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()
                        // Tournament pages are public; personal and organizer views are not.
                        .requestMatchers(HttpMethod.GET, "/api/tournaments/mine", "/api/tournaments/*/audit",
                                "/api/tournaments/*/warbands/me", "/api/tournaments/*/league-links",
                                "/api/players/search", "/api/games/**")
                                .authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/tournaments", "/api/tournaments/*",
                                "/api/tournaments/*/participants", "/api/tournaments/*/rounds",
                                "/api/tournaments/*/standings", "/api/tournaments/*/challenges",
                                "/api/tournaments/*/teams", "/api/tournaments/*/team-standings",
                                "/api/tournaments/*/matches/*/game", "/api/tournaments/*/warbands",
                                "/api/tournaments/*/warbands/*", "/api/content", "/api/content/armies",
                                "/api/tournaments/*/leagues", "/api/leagues", "/api/leagues/*", "/api/players/*",
                                "/api/ranking", "/api/live", "/api/seasons", "/api/seasons/*").permitAll()
                        // Reports (aggregates only) are also open to the game publisher.
                        .requestMatchers(HttpMethod.GET, "/api/admin/reports/**").hasAnyRole("ADMIN", "PUBLISHER")
                        // The publisher runs the official program: seasons and official tournaments.
                        .requestMatchers("/api/admin/seasons/**", "/api/admin/seasons", "/api/admin/official/**")
                                .hasAnyRole("ADMIN", "PUBLISHER")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(rs -> rs
                        .bearerTokenResolver(cookieOrHeaderTokenResolver())
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)))
                .addFilterBefore(new RateLimitFilter(props.security().authRateLimitPerMinute()),
                        UsernamePasswordAuthenticationFilter.class)
                .formLogin(f -> f.disable())
                .httpBasic(b -> b.disable())
                .logout(l -> l.disable());

        if (oauthClients.getIfAvailable() != null) {
            http.oauth2Login(o -> o
                    .successHandler(oauthSuccessHandler)
                    .failureHandler((req, res, ex) -> res.sendRedirect(props.frontendUrl() + "/login?error=OAUTH_FAILED")));
        }
        return http.build();
    }

    /** Access token from the HttpOnly cookie (browser) or Authorization header (tools, tests). */
    private BearerTokenResolver cookieOrHeaderTokenResolver() {
        DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();
        return request -> {
            // Public auth endpoints must work with an expired/invalid access cookie (e.g. /refresh).
            String uri = request.getRequestURI();
            if (uri.startsWith("/api/auth/") && !uri.equals("/api/auth/logout-all")) {
                return null;
            }
            String fromHeader = header.resolve(request);
            return fromHeader != null ? fromHeader : SessionCookies.read(request, SessionCookies.ACCESS_COOKIE);
        };
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    SecretKey jwtKey() {
        byte[] bytes = props.security().jwtSecret().getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.security.jwt-secret must be at least 32 bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtKey) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(JwtService.ISSUER));
        return decoder;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // Argon2id, parameters recommended by Spring Security 5.8+ (memory-hard, OWASP-compliant).
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }
}
