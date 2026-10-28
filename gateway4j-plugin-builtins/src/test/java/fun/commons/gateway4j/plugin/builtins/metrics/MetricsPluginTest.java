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
    void routePathPatternTagWinsOverConcreteRequestPath() {
        plugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/e2e/eng/mx/pinga").build()).build();
        exchange.getAttributes().put(MetricsPlugin.ROUTE_PATH_PATTERN_ATTR, "/e2e/eng/mx/**");

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        double count = meterRegistry.counter("gateway4j.requests.total",
                "method", "GET", "path", "/e2e/eng/mx/**").count();
        assertEquals(1.0, count, 0.001,
                "path tag must be the route pattern (monitor dashboard indexes by configured path)");
        assertEquals(0.0, meterRegistry.counter("gateway4j.requests.total",
                "method", "GET", "path", "/e2e/eng/mx/pinga").count(), 0.001);
    }

    @Test
    void blankPatternFallsBackToNormalizedRequestPath() {
        plugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users/42").build()).build();
        exchange.getAttributes().put(MetricsPlugin.ROUTE_PATH_PATTERN_ATTR, "  ");

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        double count = meterRegistry.counter("gateway4j.requests.total",
                "method", "GET", "path", "/api/users/{id}").count();
        assertEquals(1.0, count, 0.001);
    }

    @Test
    void preInstanceDoesNotRecordLatencyOrErrors() {
        // PRE completes BEFORE the forward: recording latency there would pollute
        // aggregates with near-zero durations and "unknown" status samples.
        plugin.onConfigChange(new PluginConfig("metrics",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/x").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(0, meterRegistry.find("gateway4j.request.latency").timers().size(),
                "PRE instance must not record latency");
        assertEquals(0.0, meterRegistry.counter("gateway4j.requests.errors").count(), 0.001);
    }

    @Test
    void postInstanceRecordsLatencyAndForwardFailureAsError() {
        MetricsPlugin post = new MetricsPlugin(true);
        post.setMeterRegistry(meterRegistry);
        post.onConfigChange(new PluginConfig("metrics-post",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/e2e/eng/refused/one").build()).build();
        exchange.getAttributes().put(MetricsPlugin.ROUTE_PATH_PATTERN_ATTR, "/e2e/eng/refused/**");
        exchange.getAttributes().put("gw4j:metrics_start", System.nanoTime());
        exchange.getAttributes().put(MetricsPlugin.FORWARD_ERROR_ATTR, "AnnotatedConnectException");

        StepVerifier.create(post.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(1.0, meterRegistry.counter("gateway4j.requests.errors",
                "method", "GET", "path", "/e2e/eng/refused/**", "status", "502").count(), 0.001,
                "forward failure marker must count as a request error");
        assertEquals(1, meterRegistry.find("gateway4j.request.latency")
                .tag("path", "/e2e/eng/refused/**").timers().size());
    }

    @Test
    void postInstanceCounts5xxResponseAsError() {
        MetricsPlugin post = new MetricsPlugin(true);
        post.setMeterRegistry(meterRegistry);
        post.onConfigChange(new PluginConfig("metrics-post",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/broken").build()).build();
        exchange.getResponse().setStatusCode(org.springframework.http.HttpStatus.BAD_GATEWAY);
        exchange.getAttributes().put("gw4j:metrics_start", System.nanoTime());

        StepVerifier.create(post.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(1.0, meterRegistry.counter("gateway4j.requests.errors",
                "method", "GET", "path", "/api/broken", "status", "502").count(), 0.001);
    }

    @Test
    void postInstancePluginIdAndPhase() {
        MetricsPlugin post = new MetricsPlugin(true);
        assertEquals("metrics-post", post.pluginId());
        assertEquals("POST", post.phase());
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
