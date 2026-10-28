package fun.commons.gateway4j.plugin.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginConfigTest {

    @Test
    void constructorAndGetters() {
        PluginConfig config = new PluginConfig("security", "{\"ipWhitelist\":[\"10.0.0.0/8\"]}", 3);
        assertEquals("security", config.pluginId());
        assertEquals("{\"ipWhitelist\":[\"10.0.0.0/8\"]}", config.config());
        assertEquals(3, config.configVersion());
    }

    @Test
    void emptyConfig() {
        PluginConfig config = new PluginConfig("test", "{}", 0);
        assertEquals("test", config.pluginId());
        assertEquals("{}", config.config());
        assertEquals(0, config.configVersion());
    }
}
