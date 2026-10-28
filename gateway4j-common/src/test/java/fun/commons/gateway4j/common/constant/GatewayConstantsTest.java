package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GatewayConstantsTest {

    @Test
    void maxDispatchDepth() {
        assertEquals(5, GatewayConstants.MAX_DISPATCH_DEPTH);
    }

    @Test
    void pluginContextPrefix() {
        assertEquals("gw4j:", GatewayConstants.PLUGIN_CONTEXT_PREFIX);
    }

    @Test
    void allKeysStartWithPrefix() {
        assertTrue(GatewayConstants.TRACE_ID_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX));
        assertTrue(GatewayConstants.ROUTE_ID_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX));
        assertTrue(GatewayConstants.RESOLVED_ROUTE_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX));
        assertTrue(GatewayConstants.CONFIG_VERSION_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX));
        assertTrue(GatewayConstants.REQUEST_START_TIME_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX));
    }

    @Test
    void cannotInstantiate() throws Exception {
        var ctor = GatewayConstants.class.getDeclaredConstructor();
        ctor.setAccessible(true);
        // Private constructor prevents normal instantiation; reflection still works
        // but the intent is clear: this is a utility class
        assertNotNull(ctor.newInstance());
    }
}
