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

    @Test
    void statsFieldPresentWhenExecutionStatsWiredAndAbsentOtherwise() {
        registry.register(new LoggingPlugin(false));

        fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats stats =
                new fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats();
        stats.record("logging", "日志插件", "PRE", fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats.Result.OK);
        stats.record("logging", "日志插件", "PRE", fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats.Result.ERROR);
        // "key-auth" row never executes (unregistered) → zeroed stats in its entry

        List<Plugin> rows = List.of(row("logging", "PRE", "ENABLED"), row("key-auth", "PRE", "ENABLED"));

        // with stats: optional object present on every entry
        List<Map<String, Object>> withStats = PluginRuntimeCatalogPublisher.buildCatalog(
                registry.instances(), rows, 1_700_000_000_000L, stats);
        assertEquals(2, withStats.size());
        Map<?, ?> loggingEntry = withStats.get(0);
        Map<?, ?> loggingStats = (Map<?, ?>) loggingEntry.get("stats");
        assertNotNull(loggingStats);
        assertEquals(1L, ((Number) loggingStats.get("executed")).longValue());
        assertEquals(0L, ((Number) loggingStats.get("skipped")).longValue());
        assertEquals(1L, ((Number) loggingStats.get("error")).longValue());
        Map<?, ?> keyAuthStats = (Map<?, ?>) withStats.get(1).get("stats");
        assertEquals(0L, ((Number) keyAuthStats.get("executed")).longValue());

        // contract field order: plugin_id, phase, registered, updated_at, stats(optional last)
        assertIterableEquals(List.of("plugin_id", "phase", "registered", "updated_at", "stats"),
                new LinkedHashMap<>(loggingEntry).keySet());

        // without a stats holder the field is omitted entirely (admin tolerates absence)
        List<Map<String, Object>> withoutStats = PluginRuntimeCatalogPublisher.buildCatalog(
                registry.instances(), rows, 1_700_000_000_000L);
        assertFalse(withoutStats.get(0).containsKey("stats"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void publishedCatalogJsonCarriesStatsEndToEnd() {
        // regression guard: the @EventListener must wire the stats holder into the
        // catalog builder (a 3-arg overload call would silently drop the field)
        fun.commons.framework4j.redis.manager.MultiRedisManager redisManager =
                org.mockito.Mockito.mock(fun.commons.framework4j.redis.manager.MultiRedisManager.class);
        org.springframework.data.redis.core.StringRedisTemplate template =
                org.mockito.Mockito.mock(org.springframework.data.redis.core.StringRedisTemplate.class);
        org.springframework.data.redis.core.ValueOperations<String, String> valueOps =
                org.mockito.Mockito.mock(org.springframework.data.redis.core.ValueOperations.class);
        org.mockito.Mockito.when(redisManager.getStringRedisTemplate()).thenReturn(template);
        org.mockito.Mockito.when(template.opsForValue()).thenReturn(valueOps);

        registry.register(new LoggingPlugin(false));
        fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats stats =
                new fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats();
        stats.record("logging", "日志插件", "PRE",
                fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats.Result.OK);

        PluginRuntimeCatalogPublisher publisher =
                new PluginRuntimeCatalogPublisher(redisManager, registry, stats);
        publisher.onConfigLoaded(new fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent(
                this, List.of(row("logging", "PRE", "ENABLED")), 1L));

        org.mockito.ArgumentCaptor<String> json = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(valueOps).set(
                org.mockito.Mockito.eq(PluginRuntimeCatalogPublisher.RUNTIME_CATALOG_KEY),
                json.capture(), org.mockito.Mockito.any(java.time.Duration.class));
        List<Map<String, Object>> catalog = fun.commons.gateway4j.common.util.JsonUtils
                .parseObject(json.getValue(), List.class);
        Map<?, ?> loggingEntry = (Map<?, ?>) catalog.get(0);
        Map<?, ?> loggingStats = (Map<?, ?>) loggingEntry.get("stats");
        assertNotNull(loggingStats, "stats object must survive the full publish path");
        assertEquals(1L, ((Number) loggingStats.get("executed")).longValue());
    }

    private Plugin row(String pluginId, String phase, String status) {
        return Plugin.builder().id(1L).pluginId(pluginId).pluginName("n").pluginType("BUILTIN")
                .pluginPhase(phase).scope("GLOBAL").status(status).sortOrder(1).config("{}").build();
    }
}
