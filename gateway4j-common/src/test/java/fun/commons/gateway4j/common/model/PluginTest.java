package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginTest {

    @Test
    void defaultScope() {
        Plugin plugin = Plugin.builder().build();
        assertEquals("ROUTE", plugin.getScope());
    }

    @Test
    void defaultStatus() {
        Plugin plugin = Plugin.builder().build();
        assertEquals("DISABLED", plugin.getStatus());
    }

    @Test
    void defaultConfig() {
        Plugin plugin = Plugin.builder().build();
        assertEquals("{}", plugin.getConfig());
    }

    @Test
    void defaultConfigVersion() {
        Plugin plugin = Plugin.builder().build();
        assertEquals(0L, plugin.getConfigVersion());
    }

    @Test
    void builderWithAllFields() {
        Plugin plugin = Plugin.builder()
                .id(100L)
                .pluginName("安全插件")
                .pluginId("security")
                .pluginType("BUILTIN")
                .pluginPhase("PRE")
                .scope("GLOBAL")
                .status("ENABLED")
                .sortOrder(1)
                .config("{\"ipWhitelist\":[\"10.0.0.0/8\"]}")
                .remark("IP白名单")
                .configVersion(3L)
                .build();

        assertEquals(100L, plugin.getId());
        assertEquals("security", plugin.getPluginId());
        assertEquals("BUILTIN", plugin.getPluginType());
        assertEquals("GLOBAL", plugin.getScope());
        assertEquals("ENABLED", plugin.getStatus());
        assertEquals("{\"ipWhitelist\":[\"10.0.0.0/8\"]}", plugin.getConfig());
    }
}
