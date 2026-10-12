package com.skirmishchronicle.table.library;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * Accepts only PNG, JPEG and WebP, recognised by their signature (never by the declared type or file name),
 * and reads the dimensions from the header without decoding the pixels (no decompression bombs).
 */
public final class ImageCheck {

    public static final int MAX_BYTES = 8 * 1024 * 1024;
    public static final int MAX_SIDE = 8000;
    public static final long MAX_PIXELS = 40_000_000L;

    public record Info(String contentType, int width, int height) {
    }

    private ImageCheck() {
    }

    /** @return null when the bytes are not an accepted picture */
    public static Info inspect(byte[] b) {
        if (b == null || b.length < 16 || b.length > MAX_BYTES) {
            return null;
        }
        Info info;
        if ((b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0D && b[5] == 0x0A
                && b[6] == 0x1A && b[7] == 0x0A) {
            info = viaImageIo(b, "image/png");
        } else if ((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            info = viaImageIo(b, "image/jpeg");
        } else if (b.length >= 30 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            info = webp(b);
        } else {
            return null;
        }
        if (info == null || info.width() < 1 || info.height() < 1 || info.width() > MAX_SIDE || info.height() > MAX_SIDE
                || (long) info.width() * info.height() > MAX_PIXELS) {
            return null;
        }
        return info;
    }

    private static Info viaImageIo(byte[] b, String type) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(b))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader r = readers.next();
            try {
                r.setInput(in, true, true);
                return new Info(type, r.getWidth(0), r.getHeight(0));
            } finally {
                r.dispose();
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** VP8 (lossy), VP8L (lossless) and VP8X (extended) headers. */
    static Info webp(byte[] b) {
        String chunk = new String(b, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
        switch (chunk) {
            case "VP8 " -> {
                if (b.length < 30 || (b[23] & 0xFF) != 0x9D || (b[24] & 0xFF) != 0x01 || (b[25] & 0xFF) != 0x2A) {
                    return null;
                }
                int w = ((b[26] & 0xFF) | (b[27] & 0xFF) << 8) & 0x3FFF;
                int h = ((b[28] & 0xFF) | (b[29] & 0xFF) << 8) & 0x3FFF;
                return new Info("image/webp", w, h);
            }
            case "VP8L" -> {
                if (b.length < 25 || (b[20] & 0xFF) != 0x2F) {
                    return null;
                }
                int bits = (b[21] & 0xFF) | (b[22] & 0xFF) << 8 | (b[23] & 0xFF) << 16 | (b[24] & 0xFF) << 24;
                return new Info("image/webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1);
            }
            case "VP8X" -> {
                int w = 1 + ((b[24] & 0xFF) | (b[25] & 0xFF) << 8 | (b[26] & 0xFF) << 16);
                int h = 1 + ((b[27] & 0xFF) | (b[28] & 0xFF) << 8 | (b[29] & 0xFF) << 16);
                return new Info("image/webp", w, h);
            }
            default -> {
                return null;
            }
        }
    }
}
