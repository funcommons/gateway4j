package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginPhaseTest {

    @Test
    void codeValues() {
        assertEquals("PRE", PluginPhase.PRE.code());
        assertEquals("POST", PluginPhase.POST.code());
    }

    @Test
    void fromCode() {
        assertEquals(PluginPhase.PRE, PluginPhase.fromCode("PRE"));
        assertEquals(PluginPhase.POST, PluginPhase.fromCode("POST"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> PluginPhase.fromCode("UNKNOWN"));
    }
}
