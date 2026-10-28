package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Registration assertions for every builtin plugin instance assembled by
 * ServerAutoConfiguration#pluginInstanceRegistry — plus the startup-safety
 * property: pushing a plain {@code "{}"} config row into every instance must
 * never throw (applyPluginConfigs is the startup config push path) and no
 * external-middleware plugin (Kafka/ES/DingTalk) may open connections at that
 * point (fail-open: they build clients only when config enables them).
 */
class PluginInstanceRegistryAssemblyTest {

    /** Every plugin_id the assembly must provide a runtime instance for. */
    private static final List<String> REQUIRED_IDS = List.of(
            // baseline
            BuiltinPluginConstants.SECURITY,
            BuiltinPluginConstants.CACHE, BuiltinPluginConstants.CACHE_POST,
            BuiltinPluginConstants.RATE_LIMITER,
            BuiltinPluginConstants.SHARING, BuiltinPluginConstants.SHARING_POST,
            BuiltinPluginConstants.LOGGING, BuiltinPluginConstants.LOGGING_POST,
            BuiltinPluginConstants.TRACING, BuiltinPluginConstants.TRACING_POST,
            BuiltinPluginConstants.MOCK,
            // observability (monitor dashboard)
            BuiltinPluginConstants.METRICS, BuiltinPluginConstants.METRICS_POST,
            // traffic shaping
            BuiltinPluginConstants.REWRITE,
            // authentication / security
            BuiltinPluginConstants.JWT, BuiltinPluginConstants.KEY_AUTH,
            BuiltinPluginConstants.BASIC_AUTH, BuiltinPluginConstants.SIGN,
            BuiltinPluginConstants.WAF, BuiltinPluginConstants.OAUTH2,
            // fault tolerance
            BuiltinPluginConstants.CIRCUIT_BREAKER, BuiltinPluginConstants.SENTINEL,
            // traffic governance
            BuiltinPluginConstants.RETRY, BuiltinPluginConstants.REDIRECT,
            BuiltinPluginConstants.WEBSOCKET, BuiltinPluginConstants.PARAM_MAPPING,
            BuiltinPluginConstants.CONTEXT_PATH,
            // external logging (PRE + POST twins)
            BuiltinPluginConstants.LOGGING_KAFKA, BuiltinPluginConstants.LOGGING_KAFKA_POST,
            BuiltinPluginConstants.LOGGING_ES, BuiltinPluginConstants.LOGGING_ES_POST,
            // request/response rewriting
            BuiltinPluginConstants.REQUEST, BuiltinPluginConstants.MODIFY_RESPONSE,
            BuiltinPluginConstants.CRYPTOR_REQUEST, BuiltinPluginConstants.CRYPTOR_RESPONSE,
            BuiltinPluginConstants.DINGTALK, BuiltinPluginConstants.WATERMARK);

    @Test
    void allBuiltinPluginIdsHaveRuntimeInstances() {
        PluginInstanceRegistry registry = new ServerAutoConfiguration()
                .pluginInstanceRegistry(new SimpleMeterRegistry());

        List<String> missing = new ArrayList<>();
        for (String id : REQUIRED_IDS) {
            if (!registry.isRegistered(id)) {
                missing.add(id);
            }
        }
        assertTrue(missing.isEmpty(), "plugin ids missing a runtime instance: " + missing);
    }

    @Test
    void pushingBlankOrMalformedConfigToEveryInstanceNeverThrows() {
        PluginInstanceRegistry registry = new ServerAutoConfiguration()
                .pluginInstanceRegistry(new SimpleMeterRegistry());

        List<Plugin> rows = new ArrayList<>();
        for (int i = 0; i < REQUIRED_IDS.size(); i++) {
            rows.add(Plugin.builder().id((long) i).pluginId(REQUIRED_IDS.get(i))
                    .pluginName("p" + i).pluginType("BUILTIN").pluginPhase("PRE")
                    .scope("GLOBAL").status("ENABLED").sortOrder(i).config("{}").build());
        }
        // also feed a malformed config — applyPluginConfigs must fail-open per plugin
        rows.add(Plugin.builder().id(999L).pluginId(BuiltinPluginConstants.WAF)
                .pluginName("bad").pluginType("BUILTIN").pluginPhase("PRE")
                .scope("GLOBAL").status("ENABLED").sortOrder(0).config("{not-json").build());

        assertDoesNotThrow(() -> registry.applyPluginConfigs(rows));
    }

    @Test
    void metricsInstanceIsWiredWithMeterRegistry() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        PluginInstanceRegistry registry = new ServerAutoConfiguration().pluginInstanceRegistry(meterRegistry);

        var metrics = registry.find(BuiltinPluginConstants.METRICS);
        assertNotNull(metrics);

        // a PRE phase instance — required so it can join the global PRE chain
        assertEquals("PRE", metrics.phase());
    }

    /**
     * Engine and MetricsPlugin share the route-path-pattern exchange key across
     * module boundaries by literal (plugin-api cannot carry it) — guard against
     * silent drift with this cross-module assertion.
     */
    @Test
    void engineAndMetricsPluginShareRoutePathPatternKey() {
        assertEquals(fun.commons.gateway4j.engine.filter.PluginExecutionFilter.ROUTE_PATH_PATTERN_ATTR,
                fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin.ROUTE_PATH_PATTERN_ATTR);
        assertEquals(fun.commons.gateway4j.engine.filter.PluginExecutionFilter.FORWARD_ERROR_ATTR,
                fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin.FORWARD_ERROR_ATTR);
    }
}
