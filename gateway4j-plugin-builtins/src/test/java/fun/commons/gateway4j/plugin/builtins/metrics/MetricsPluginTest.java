package fun.commons.gateway4j.plugin.builtins.metrics;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class MetricsPluginTest {

    private MetricsPlugin plugin;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        plugin = new MetricsPlugin();
        meterRegistry = new SimpleMeterRegistry();
        plugin.setMeterRegistry(meterRegistry);
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void configEnabledRecordsRequestCount() {
        plugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        double count = meterRegistry.counter("gateway4j.requests.total",
                "method", "GET", "path", "/api/users").count();
        assertEquals(1.0, count, 0.001);
    }

    @Test
    void configDisabledPassesThrough() {
        plugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":false}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void nullMeterRegistryPassesThrough() {
        MetricsPlugin noRegistryPlugin = new MetricsPlugin();
        noRegistryPlugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":true}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(noRegistryPlugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("metrics", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
