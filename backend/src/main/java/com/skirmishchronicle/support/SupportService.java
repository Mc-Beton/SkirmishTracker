package com.skirmishchronicle.support;

import com.skirmishchronicle.common.CurrentUser;
import com.skirmishchronicle.identity.service.MailService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contact form: the message is stored (so nothing is lost when e-mail fails) and forwarded to the support inbox
 * with Reply-To set to the sender. Kept for 365 days, as stated in the terms of use.
 */
@Service
public class SupportService {

    private static final int KEEP_DAYS = 365;

    private final SupportRepository messages;
    private final MailService mail;

    public SupportService(SupportRepository messages, MailService mail) {
        this.messages = messages;
        this.mail = mail;
    }

    @Transactional
    public void submit(CurrentUser actor, String email, String name, SupportMessage.Topic topic, String message,
                       String locale) {
        String cleanName = name == null || name.isBlank() ? null : oneLine(name.strip());
        SupportMessage saved = messages.save(new SupportMessage(actor == null ? null : actor.id(), email.strip(),
                cleanName, topic, message.strip(), "en".equals(locale) ? "en" : "pl"));
        mail.sendSupportMessage(saved);
    }

    @Scheduled(cron = "0 15 4 * * *")
    @Transactional
    public void cleanup() {
        messages.deleteOlderThan(Instant.now().minus(KEEP_DAYS, ChronoUnit.DAYS));
    }

    /** No line breaks in values that end up in mail headers or a one-line summary. */
    static String oneLine(String s) {
        return s.replaceAll("[\\r\\n\\t]+", " ");
    }
}
