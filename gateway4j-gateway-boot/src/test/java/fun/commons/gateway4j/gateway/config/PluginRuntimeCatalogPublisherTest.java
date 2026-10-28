package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.plugin.builtins.logging.LoggingPlugin;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PluginRuntimeCatalogPublisherTest {

    private final PluginInstanceRegistry registry = new PluginInstanceRegistry();

    @Test
    void catalogListsRegisteredInstancesThenUnregisteredEnabledRows() {
        registry.register(new LoggingPlugin(false)); // plugin_id=logging, phase PRE

        List<Plugin> rows = List.of(
                // already covered by the instance → must not duplicate
                row("logging", "PRE", "ENABLED"),
                // no instance → registered=false
                row("key-auth", "PRE", "ENABLED"),
                // disabled row without instance → not listed
                row("jwt", "PRE", "DISABLED"),
                // malformed entry → skipped
                row(null, "PRE", "ENABLED"));

        List<Map<String, Object>> catalog =
                PluginRuntimeCatalogPublisher.buildCatalog(registry.instances(), rows, 1_700_000_000_000L);

        assertEquals(2, catalog.size());
        assertEquals("logging", catalog.get(0).get("plugin_id"));
        assertEquals("PRE", catalog.get(0).get("phase"));
        assertEquals(Boolean.TRUE, catalog.get(0).get("registered"));
        assertEquals(1_700_000_000_000L, catalog.get(0).get("updated_at"));

        assertEquals("key-auth", catalog.get(1).get("plugin_id"));
        assertEquals("PRE", catalog.get(1).get("phase"));
        assertEquals(Boolean.FALSE, catalog.get(1).get("registered"));
        assertEquals(1_700_000_000_000L, catalog.get(1).get("updated_at"));

        // contract field order for the admin side: plugin_id, phase, registered, updated_at
        assertIterableEquals(List.of("plugin_id", "phase", "registered", "updated_at"),
                new LinkedHashMap<>(catalog.get(0)).keySet());
    }

    @Test
    void redisKeyAndChannelContractStayVerbatim() {
        assertEquals("gateway4j:plugin:runtime", PluginRuntimeCatalogPublisher.RUNTIME_CATALOG_KEY);
        assertEquals("gateway4j:config:changed", ConfigPushSubscriber.CONFIG_CHANGED_CHANNEL);
    }

    private Plugin row(String pluginId, String phase, String status) {
        return Plugin.builder().id(1L).pluginId(pluginId).pluginName("n").pluginType("BUILTIN")
                .pluginPhase(phase).scope("GLOBAL").status(status).sortOrder(1).config("{}").build();
    }
}
