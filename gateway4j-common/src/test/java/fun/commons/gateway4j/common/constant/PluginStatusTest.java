package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginStatusTest {

    @Test
    void codeValues() {
        assertEquals("ENABLED", PluginStatus.ENABLED.code());
        assertEquals("DISABLED", PluginStatus.DISABLED.code());
    }

    @Test
    void fromCode() {
        assertEquals(PluginStatus.ENABLED, PluginStatus.fromCode("ENABLED"));
        assertEquals(PluginStatus.DISABLED, PluginStatus.fromCode("DISABLED"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> PluginStatus.fromCode("UNKNOWN"));
    }
}
