package fun.commons.gateway4j.plugin.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginResultTest {

    @Test
    void success() {
        PluginResult result = PluginResult.success();
        assertTrue(result.isSuccess());
        assertFalse(result.isFailed());
        assertFalse(result.isSkip());
        assertNull(result.errorMessage());
        assertEquals(PluginResult.Type.SUCCESS, result.type());
    }

    @Test
    void failed() {
        PluginResult result = PluginResult.failed("IP被拒绝");
        assertFalse(result.isSuccess());
        assertTrue(result.isFailed());
        assertEquals("IP被拒绝", result.errorMessage());
        assertEquals(PluginResult.Type.FAILED, result.type());
    }

    @Test
    void skip() {
        PluginResult result = PluginResult.skip();
        assertTrue(result.isSkip());
        assertNull(result.errorMessage());
        assertEquals(PluginResult.Type.SKIP, result.type());
    }
}
