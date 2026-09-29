package com.skirmishchronicle.push;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push message encryption (RFC 8291, "aes128gcm" content coding, RFC 8188) and VAPID tokens (RFC 8292),
 * with the JDK only. Keys travel as base64url: public keys as 65-byte uncompressed P-256 points, private keys
 * as the 32-byte scalar.
 */
public final class WebPushCrypto {

    private static final int RECORD_SIZE = 4096;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final ECParameterSpec P256 = p256();

    private WebPushCrypto() {
    }

    // ------------------------------------------------------------------ keys

    public static KeyPair generateKeyPair() throws GeneralSecurityException {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return g.generateKeyPair();
    }

    /** 65-byte uncompressed point 0x04 || X || Y. */
    public static byte[] rawPublic(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        copy32(key.getW().getAffineX(), out, 1);
        copy32(key.getW().getAffineY(), out, 33);
        return out;
    }

    public static byte[] rawPrivate(ECPrivateKey key) {
        byte[] out = new byte[32];
        copy32(key.getS(), out, 0);
        return out;
    }

    public static ECPublicKey publicKey(byte[] raw) throws GeneralSecurityException {
        if (raw.length != 65 || raw[0] != 0x04) {
            throw new GeneralSecurityException("not an uncompressed P-256 point");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(raw, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(raw, 33, 65));
        if (!onCurve(x, y)) {
            // The JDK does not check this; ECDH with a point off the curve can leak key material.
            throw new GeneralSecurityException("point is not on P-256");
        }
        ECPoint w = new ECPoint(x, y);
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, P256));
    }

    public static ECPrivateKey privateKey(byte[] raw) throws GeneralSecurityException {
        return (ECPrivateKey) KeyFactory.getInstance("EC")
                .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, raw), P256));
    }

    public static String b64(byte[] bytes) {
        return B64.encodeToString(bytes);
    }

    public static byte[] unb64(String s) {
        return B64D.decode(s.replace('+', '-').replace('/', '_').replace("=", ""));
    }

    // ------------------------------------------------------------------ encryption (RFC 8291)

    public static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret) throws GeneralSecurityException {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return encrypt(plaintext, uaPublic, authSecret, generateKeyPair(), salt);
    }

    /** Deterministic variant for tests: application-server key pair and salt given. */
    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, KeyPair asKeys, byte[] salt)
            throws GeneralSecurityException {
        if (plaintext.length > RECORD_SIZE - 17 - 86) {
            throw new GeneralSecurityException("payload too large");
        }
        byte[] asPublic = rawPublic((ECPublicKey) asKeys.getPublic());
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(asKeys.getPrivate());
        ka.doPhase(publicKey(uaPublic), true);
        byte[] ecdhSecret = ka.generateSecret();

        byte[] prkKey = hmac(authSecret, ecdhSecret);
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublic, asPublic,
                new byte[] {1});
        byte[] ikm = hmac(prkKey, keyInfo);
        byte[] prk = hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concat("Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII),
                new byte[] {1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concat("Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII),
                new byte[] {1})), 12);

        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = gcm.doFinal(concat(plaintext, new byte[] {2})); // 0x02: last (and only) record

        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
        return concat(header.array(), ciphertext);
    }

    /** Decryption with the user agent's private key – used by tests to check the round trip. */
    static byte[] decrypt(byte[] body, byte[] uaPrivate, byte[] uaPublic, byte[] authSecret)
            throws GeneralSecurityException {
        byte[] salt = Arrays.copyOfRange(body, 0, 16);
        int idLen = body[20] & 0xff;
        byte[] asPublic = Arrays.copyOfRange(body, 21, 21 + idLen);
        byte[] ciphertext = Arrays.copyOfRange(body, 21 + idLen, body.length);
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(privateKey(uaPrivate));
        ka.doPhase(publicKey(asPublic), true);
        byte[] ecdhSecret = ka.generateSecret();
        byte[] prkKey = hmac(authSecret, ecdhSecret);
        byte[] ikm = hmac(prkKey, concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublic, asPublic,
                new byte[] {1}));
        byte[] prk = hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concat("Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII),
                new byte[] {1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concat("Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII),
                new byte[] {1})), 12);
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] padded = gcm.doFinal(ciphertext);
        int end = padded.length - 1;
        while (end >= 0 && padded[end] == 0) {
            end--;
        }
        return Arrays.copyOf(padded, end); // drop the 0x02 delimiter
    }

    // ------------------------------------------------------------------ VAPID (RFC 8292)

    /** "vapid t=…, k=…" Authorization header for a push service origin. */
    public static String vapidAuthorization(String audience, String subject, ECPrivateKey key, byte[] publicRaw,
                                            long expiresAtEpochSeconds) throws GeneralSecurityException {
        String header = b64("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = b64(("{\"aud\":\"" + json(audience) + "\",\"exp\":" + expiresAtEpochSeconds + ",\"sub\":\""
                + json(subject) + "\"}").getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + claims;
        Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
        es256.initSign(key);
        es256.update(signingInput.getBytes(StandardCharsets.US_ASCII));
        String token = signingInput + "." + b64(es256.sign());
        return "vapid t=" + token + ", k=" + b64(publicRaw);
    }

    // ------------------------------------------------------------------ helpers

    private static String json(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) {
            out.writeBytes(p);
        }
        return out.toByteArray();
    }

    private static void copy32(BigInteger v, byte[] out, int offset) {
        byte[] b = v.toByteArray();
        int len = Math.min(b.length, 32);
        System.arraycopy(b, b.length - len, out, offset + 32 - len, len);
    }

    /** y² = x³ + ax + b (mod p), coordinates in [0, p). */
    private static boolean onCurve(BigInteger x, BigInteger y) {
        java.security.spec.ECFieldFp field = (java.security.spec.ECFieldFp) P256.getCurve().getField();
        BigInteger p = field.getP();
        if (x.signum() < 0 || y.signum() < 0 || x.compareTo(p) >= 0 || y.compareTo(p) >= 0) {
            return false;
        }
        BigInteger left = y.multiply(y).mod(p);
        BigInteger right = x.pow(3).add(P256.getCurve().getA().multiply(x)).add(P256.getCurve().getB()).mod(p);
        return left.equals(right);
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters p = AlgorithmParameters.getInstance("EC");
            p.init(new ECGenParameterSpec("secp256r1"));
            return p.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("P-256 not available", e);
        }
    }
}
