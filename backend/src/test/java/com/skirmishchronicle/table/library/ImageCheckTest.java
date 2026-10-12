package com.skirmishchronicle.table.library;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageCheckTest {

    private static byte[] encode(String format, int w, int h) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), format, out);
        return out.toByteArray();
    }

    @Test
    void pngAndJpegAreRecognisedByTheirBytes() throws Exception {
        ImageCheck.Info png = ImageCheck.inspect(encode("png", 300, 200));
        assertEquals("image/png", png.contentType());
        assertEquals(300, png.width());
        assertEquals(200, png.height());
        assertEquals("image/jpeg", ImageCheck.inspect(encode("jpg", 64, 64)).contentType());
    }

    @Test
    void webpHeadersGiveTheSize() {
        byte[] b = new byte[30];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, b, 0, 4);
        System.arraycopy("WEBPVP8X".getBytes(StandardCharsets.US_ASCII), 0, b, 8, 8);
        b[24] = (byte) 0xFF; b[25] = 0x03; // width 1024
        b[27] = (byte) 0xFF; b[28] = 0x01; // height 512
        ImageCheck.Info info = ImageCheck.inspect(b);
        assertEquals(1024, info.width());
        assertEquals(512, info.height());
    }

    @Test
    void anythingElseIsRefused() throws Exception {
        assertNull(ImageCheck.inspect("<svg onload=alert(1)></svg>".getBytes(StandardCharsets.UTF_8)));
        assertNull(ImageCheck.inspect(encode("gif", 10, 10)));
        assertNull(ImageCheck.inspect(new byte[ImageCheck.MAX_BYTES + 1]));
        // declared huge (decompression bomb) – refused from the header alone
        byte[] bomb = new byte[30];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, bomb, 0, 4);
        System.arraycopy("WEBPVP8X".getBytes(StandardCharsets.US_ASCII), 0, bomb, 8, 8);
        bomb[24] = (byte) 0xFF; bomb[25] = (byte) 0xFF; bomb[26] = 0x0F;
        bomb[27] = (byte) 0xFF; bomb[28] = (byte) 0xFF; bomb[29] = 0x0F;
        assertNull(ImageCheck.inspect(bomb));
    }
}
