package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginScopeTest {

    @Test
    void codeValues() {
        assertEquals("GLOBAL", PluginScope.GLOBAL.code());
        assertEquals("ROUTE", PluginScope.ROUTE.code());
    }

    @Test
    void fromCode() {
        assertEquals(PluginScope.GLOBAL, PluginScope.fromCode("GLOBAL"));
        assertEquals(PluginScope.ROUTE, PluginScope.fromCode("ROUTE"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> PluginScope.fromCode("UNKNOWN"));
    }
}
