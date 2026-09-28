package com.skirmishchronicle.identity.oauth;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.config.AppProperties;
import com.skirmishchronicle.identity.domain.User;
import com.skirmishchronicle.identity.service.ExternalAccountService;
import com.skirmishchronicle.identity.service.ExternalAccountService.ExternalProfile;
import com.skirmishchronicle.identity.web.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * After Google/Discord login: map the provider profile to a local user, issue our own session cookies
 * and send the browser back to the frontend. The OAuth2 session itself is discarded.
 */
@Component
public class OAuthLoginSuccessHandler implements AuthenticationSuccessHandler {

    private final ExternalAccountService accounts;
    private final SessionService sessions;
    private final AppProperties props;

    public OAuthLoginSuccessHandler(ExternalAccountService accounts, SessionService sessions, AppProperties props) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.props = props;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;
        String provider = token.getAuthorizedClientRegistrationId();
        try {
            User user = accounts.resolve(toProfile(provider, token.getPrincipal()));
            sessions.start(user, request, response);
            if (request.getSession(false) != null) {
                request.getSession(false).invalidate();
            }
            response.sendRedirect(props.frontendUrl() + "/account");
        } catch (ApiException e) {
            response.sendRedirect(props.frontendUrl() + "/login?error=" + e.getCode());
        }
    }

    static ExternalProfile toProfile(String provider, OAuth2User principal) {
        Map<String, Object> a = principal.getAttributes();
        return switch (provider) {
            case "google" -> new ExternalProfile("google", str(a.get("sub")), str(a.get("email")),
                    Boolean.TRUE.equals(a.get("email_verified")), str(a.get("name")),
                    ExternalAccountService.normalizeLocale(str(a.get("locale"))));
            case "discord" -> new ExternalProfile("discord", str(a.get("id")), str(a.get("email")),
                    Boolean.TRUE.equals(a.get("verified")),
                    a.get("global_name") != null ? str(a.get("global_name")) : str(a.get("username")),
                    ExternalAccountService.normalizeLocale(str(a.get("locale"))));
            default -> throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "OAUTH_PROVIDER_UNKNOWN");
        };
    }

    private static String str(Object value) {
        return value == null ? null : value.toString();
    }
}
