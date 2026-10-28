package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginTypeTest {

    @Test
    void codeValues() {
        assertEquals("BUILTIN", PluginType.BUILTIN.code());
        assertEquals("JAR", PluginType.JAR.code());
        assertEquals("GROOVY", PluginType.GROOVY.code());
        assertEquals("GROUP", PluginType.GROUP.code());
    }

    @Test
    void fromCode() {
        assertEquals(PluginType.BUILTIN, PluginType.fromCode("BUILTIN"));
        assertEquals(PluginType.JAR, PluginType.fromCode("JAR"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> PluginType.fromCode("UNKNOWN"));
    }
}
