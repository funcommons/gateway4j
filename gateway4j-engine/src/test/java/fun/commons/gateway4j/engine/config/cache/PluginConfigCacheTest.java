package fun.commons.gateway4j.engine.config.cache;

import fun.commons.gateway4j.common.model.Plugin;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PluginConfigCacheTest {

    private PluginConfigCache cache;

    @BeforeEach
    void setUp() {
        cache = new PluginConfigCache();
    }

    @Test
    void putAndGet() {
        Plugin plugin = Plugin.builder().id(1L).pluginId("security").pluginType("BUILTIN")
                .pluginPhase("PRE").scope("GLOBAL").status("ENABLED").sortOrder(1).build();
        cache.putPlugin(plugin);
        assertEquals(plugin, cache.getPlugin(1L));
    }

    @Test
    void getMissingReturnsNull() {
        assertNull(cache.getPlugin(999L));
    }

    @Test
    void getGlobalPluginsFiltersByPhase() {
        cache.refreshAll(List.of(
                Plugin.builder().id(1L).pluginPhase("PRE").scope("GLOBAL").status("ENABLED").sortOrder(1).build(),
                Plugin.builder().id(2L).pluginPhase("POST").scope("GLOBAL").status("ENABLED").sortOrder(2).build(),
                Plugin.builder().id(3L).pluginPhase("PRE").scope("ROUTE").status("ENABLED").sortOrder(3).build()
        ));
        assertEquals(1, cache.getGlobalPlugins("PRE").size());
        assertEquals(1, cache.getGlobalPlugins("POST").size());
    }

    @Test
    void getGlobalPluginsFiltersEnabled() {
        cache.refreshAll(List.of(
                Plugin.builder().id(1L).pluginPhase("PRE").scope("GLOBAL").status("ENABLED").sortOrder(1).build(),
                Plugin.builder().id(2L).pluginPhase("PRE").scope("GLOBAL").status("DISABLED").sortOrder(2).build()
        ));
        assertEquals(1, cache.getGlobalPlugins("PRE").size());
    }

    @Test
    void invalidate() {
        cache.putPlugin(Plugin.builder().id(1L).build());
        cache.invalidatePlugin(1L);
        assertNull(cache.getPlugin(1L));
    }

    @Test
    void refreshAll() {
        cache.refreshAll(List.of(
                Plugin.builder().id(1L).build(),
                Plugin.builder().id(2L).build()
        ));
        assertEquals(2, cache.getAllPlugins().size());
    }
}
