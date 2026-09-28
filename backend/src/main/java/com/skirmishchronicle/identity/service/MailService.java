package com.skirmishchronicle.identity.service;

import com.skirmishchronicle.config.AppProperties;
import com.skirmishchronicle.identity.domain.User;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Transactional e-mails. Local development uses Mailpit (http://localhost:8025). */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender sender;
    private final AppProperties props;

    public MailService(JavaMailSender sender, AppProperties props) {
        this.sender = sender;
        this.props = props;
    }

    public void sendVerification(User user, String rawToken) {
        String link = props.frontendUrl() + "/verify-email?token=" + encode(rawToken);
        boolean pl = "pl".equals(user.getLocale());
        send(user.getEmail(),
                pl ? "Skirmish Chronicle – potwierdź adres e-mail" : "Skirmish Chronicle – confirm your e-mail",
                (pl ? "Cześć " : "Hi ") + user.getDisplayName() + ",\n\n"
                        + (pl ? "Kliknij, aby potwierdzić adres e-mail:\n" : "Click to confirm your e-mail address:\n")
                        + link + "\n\n"
                        + (pl ? "Link wygasa po 24 godzinach." : "The link expires in 24 hours."));
    }

    public void sendPasswordReset(User user, String rawToken) {
        String link = props.frontendUrl() + "/reset-password?token=" + encode(rawToken);
        boolean pl = "pl".equals(user.getLocale());
        send(user.getEmail(),
                pl ? "Skirmish Chronicle – reset hasła" : "Skirmish Chronicle – password reset",
                (pl ? "Ustaw nowe hasło:\n" : "Set a new password:\n") + link + "\n\n"
                        + (pl ? "Link wygasa po 30 minutach. Jeśli to nie Ty, zignoruj tę wiadomość."
                              : "The link expires in 30 minutes. If this wasn't you, ignore this message."));
    }

    private void send(String to, String subject, String body) {
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(props.mailFrom());
            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(body);
            sender.send(msg);
        } catch (MailException e) {
            log.error("Failed to send e-mail '{}'", subject, e);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
