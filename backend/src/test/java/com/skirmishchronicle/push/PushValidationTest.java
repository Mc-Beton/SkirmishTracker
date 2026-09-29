package com.skirmishchronicle.push;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import org.junit.jupiter.api.Test;

/** The server POSTs to subscription endpoints, so only known push services are accepted (no SSRF). */
class PushValidationTest {

    @Test
    void onlyKnownPushServicesAreAccepted() {
        assertTrue(PushService.allowedEndpoint("https://fcm.googleapis.com/fcm/send/abc:APA91b"));
        assertTrue(PushService.allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA"));
        assertTrue(PushService.allowedEndpoint("https://web.push.apple.com/QGuQyavXutnMBP"));
        assertTrue(PushService.allowedEndpoint("https://db5p.notify.windows.com/w/?token=x"));
        assertFalse(PushService.allowedEndpoint("http://fcm.googleapis.com/fcm/send/abc"));          // not https
        assertFalse(PushService.allowedEndpoint("https://localhost:8080/actuator"));
        assertFalse(PushService.allowedEndpoint("https://169.254.169.254/latest/meta-data"));
        assertFalse(PushService.allowedEndpoint("https://fcm.googleapis.com.evil.example/x"));
        assertFalse(PushService.allowedEndpoint("https://push.apple.com/x"));                        // bare suffix
        assertFalse(PushService.allowedEndpoint("https://user@fcm.googleapis.com/x"));
        assertFalse(PushService.allowedEndpoint("https://fcm.googleapis.com:8443/x"));
        assertFalse(PushService.allowedEndpoint(null));
    }

    @Test
    void keysMustBeAP256PointAndA16ByteSecret() throws Exception {
        KeyPair pair = WebPushCrypto.generateKeyPair();
        String pub = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) pair.getPublic()));
        String auth = WebPushCrypto.b64(new byte[16]);
        assertTrue(PushService.validKeys(pub, auth));
        assertFalse(PushService.validKeys(pub, WebPushCrypto.b64(new byte[8])));
        byte[] notOnCurve = new byte[65];
        notOnCurve[0] = 4;
        notOnCurve[64] = 1;
        assertFalse(PushService.validKeys(WebPushCrypto.b64(notOnCurve), auth));
        assertFalse(PushService.validKeys("!!!", auth));
    }
}
