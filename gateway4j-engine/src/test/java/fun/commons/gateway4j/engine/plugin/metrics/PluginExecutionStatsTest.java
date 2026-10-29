package fun.commons.gateway4j.engine.plugin.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginExecutionStatsTest {

    @Test
    void meterNameContractIsVerbatim() {
        assertEquals("gateway4j_plugin_execution", PluginExecutionStats.METER_NAME);
    }

    @Test
    void countersAccumulatePerPluginId() {
        PluginExecutionStats stats = new PluginExecutionStats();
        stats.record("security", "安全插件", "PRE", PluginExecutionStats.Result.OK);
        stats.record("security", "安全插件", "PRE", PluginExecutionStats.Result.OK);
        stats.record("security", "安全插件", "PRE", PluginExecutionStats.Result.ERROR);
        stats.record("groovy-1", "g1", "PRE", PluginExecutionStats.Result.SKIPPED);

        assertArrayEquals(new long[]{2, 0, 1}, stats.statsFor("security"));
        assertArrayEquals(new long[]{0, 1, 0}, stats.statsFor("groovy-1"));
        assertArrayEquals(new long[]{0, 0, 0}, stats.statsFor("unknown-plugin"));
        assertEquals(2, stats.snapshot().size());
    }

    @Test
    void nullArgumentsDegradeToUnknownWithoutThrowing() {
        PluginExecutionStats stats = new PluginExecutionStats();
        assertDoesNotThrow(() -> stats.record(null, null, null, PluginExecutionStats.Result.ERROR));
        assertArrayEquals(new long[]{0, 0, 1}, stats.statsFor("unknown"));
    }

    @Test
    void micrometerCounterCarriesContractTags() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PluginExecutionStats stats = new PluginExecutionStats(registry);

        stats.record("security", "安全插件", "PRE", PluginExecutionStats.Result.OK);
        stats.record("security", "安全插件", "PRE", PluginExecutionStats.Result.ERROR);
        stats.record("groovy-1", null, "PRE", PluginExecutionStats.Result.SKIPPED);

        assertEquals(1d, registry.get("gateway4j_plugin_execution")
                .tag("plugin_id", "security").tag("result", "ok").counter().count());
        assertEquals(1d, registry.get("gateway4j_plugin_execution")
                .tag("plugin_id", "security").tag("result", "error").counter().count());
        assertEquals(1d, registry.get("gateway4j_plugin_execution")
                .tag("plugin_id", "groovy-1").tag("plugin", "unknown")
                .tag("phase", "PRE").tag("result", "skipped").counter().count());
        // plugin name tag present on every meter
        assertEquals("安全插件", registry.get("gateway4j_plugin_execution")
                .tag("plugin_id", "security").tag("result", "ok").counter().getId().getTag("plugin"));
    }

    @Test
    void nullRegistrySkipsMicrometerBranchButStillCounts() {
        PluginExecutionStats stats = new PluginExecutionStats(null);
        stats.record("p", "p", "PRE", PluginExecutionStats.Result.OK);
        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("p"));
        assertTrue(stats.snapshot().containsKey("p"));
    }
}
