package com.skirmishchronicle.push;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class WebPushCryptoTest {

    private static byte[] d(String b64url) {
        return WebPushCrypto.unb64(b64url);
    }

    /** RFC 8291, Appendix A (Encryption Example). */
    @Test
    void matchesTheRfc8291Example() throws Exception {
        byte[] plaintext = "When I grow up, I want to be a watermelon".getBytes(StandardCharsets.US_ASCII);
        byte[] asPrivate = d("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
        byte[] asPublic = d("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
        byte[] uaPublic = d("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
        byte[] auth = d("BTBZMqHH6r4Tts7J_aSIgg");
        byte[] salt = d("DGv6ra1nlYgDCS1FRnbzlw");
        KeyPair as = new KeyPair(WebPushCrypto.publicKey(asPublic), WebPushCrypto.privateKey(asPrivate));
        byte[] body = WebPushCrypto.encrypt(plaintext, uaPublic, auth, as, salt);
        assertEquals("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
                WebPushCrypto.b64(body));
    }

    @Test
    void roundTripWithFreshKeys() throws Exception {
        KeyPair ua = WebPushCrypto.generateKeyPair();
        byte[] uaPublic = WebPushCrypto.rawPublic((ECPublicKey) ua.getPublic());
        byte[] uaPrivate = WebPushCrypto.rawPrivate((ECPrivateKey) ua.getPrivate());
        byte[] auth = new byte[16];
        new java.security.SecureRandom().nextBytes(auth);
        byte[] msg = "{\"type\":\"ROUND_STARTED\",\"params\":{\"tournament\":\"Puchar Wisły\"}}".getBytes(StandardCharsets.UTF_8);
        byte[] body = WebPushCrypto.encrypt(msg, uaPublic, auth);
        assertArrayEquals(msg, WebPushCrypto.decrypt(body, uaPrivate, uaPublic, auth));
        assertEquals(4096, java.nio.ByteBuffer.wrap(body, 16, 4).getInt());
    }

    @Test
    void vapidTokenIsAValidEs256Jwt() throws Exception {
        KeyPair vapid = WebPushCrypto.generateKeyPair();
        byte[] pub = WebPushCrypto.rawPublic((ECPublicKey) vapid.getPublic());
        String header = WebPushCrypto.vapidAuthorization("https://fcm.googleapis.com", "mailto:admin@warbracket.pl",
                (ECPrivateKey) vapid.getPrivate(), pub, 2_000_000_000L);
        assertTrue(header.startsWith("vapid t="));
        String token = header.substring(8, header.indexOf(", k="));
        assertEquals(WebPushCrypto.b64(pub), header.substring(header.indexOf(", k=") + 4));
        String[] parts = token.split("\\.");
        String claims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertTrue(claims.contains("\"aud\":\"https://fcm.googleapis.com\""));
        Signature verify = Signature.getInstance("SHA256withECDSAinP1363Format");
        verify.initVerify(vapid.getPublic());
        verify.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(verify.verify(Base64.getUrlDecoder().decode(parts[2])));
    }
}
