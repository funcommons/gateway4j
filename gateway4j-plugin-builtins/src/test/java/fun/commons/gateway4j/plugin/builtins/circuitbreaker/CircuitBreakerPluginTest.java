package fun.commons.gateway4j.plugin.builtins.circuitbreaker;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class CircuitBreakerPluginTest {

    private CircuitBreakerPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new CircuitBreakerPlugin();
    }

    private MockServerWebExchange createExchange(String path) {
        MockServerHttpRequest request = MockServerHttpRequest.get(path).build();
        return MockServerWebExchange.builder(request).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    private PluginChain failingChain() {
        return exchange -> Mono.error(new RuntimeException("upstream error"));
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void circuitBreakerAllowsWhenClosed() {
        plugin.onConfigChange(new PluginConfig("circuit-breaker",
                "{\"circuitEnable\":true,\"failureRateThreshold\":50,\"waitDurationMs\":1000," +
                "\"permittedCallsInHalfOpen\":5,\"slidingWindowSize\":10,\"minimumNumberOfCalls\":5," +
                "\"timeoutDurationMs\":3000,\"limitForPeriod\":100,\"limitRefreshPeriodMs\":1000}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void circuitBreakerRejectsWhenOpen() {
        plugin.onConfigChange(new PluginConfig("circuit-breaker",
                "{\"circuitEnable\":true,\"failureRateThreshold\":50,\"waitDurationMs\":60000," +
                "\"permittedCallsInHalfOpen\":3,\"slidingWindowSize\":5,\"minimumNumberOfCalls\":5," +
                "\"timeoutDurationMs\":3000,\"limitForPeriod\":100,\"limitRefreshPeriodMs\":1000}", 1));

        // Execute once to lazily create the circuit breaker, then force it open
        MockServerWebExchange warmup = createExchange("/test");
        StepVerifier.create(plugin.execute(warmup, passThroughChain())).verifyComplete();

        plugin.forceCircuitOpenForTest();

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    @Test
    void rateLimiterOnlyWhenCircuitDisabled() {
        plugin.onConfigChange(new PluginConfig("circuit-breaker",
                "{\"circuitEnable\":false,\"limitForPeriod\":2,\"limitRefreshPeriodMs\":1000," +
                "\"timeoutDurationMs\":1000}", 1));

        MockServerWebExchange exchange1 = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange1, passThroughChain())).verifyComplete();

        MockServerWebExchange exchange2 = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange2, passThroughChain())).verifyComplete();
    }

    @Test
    void circuitDisabledWithNoRateLimitPassesThrough() {
        plugin.onConfigChange(new PluginConfig("circuit-breaker",
                "{\"circuitEnable\":false}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void onDestroyResetsState() {
        plugin.onConfigChange(new PluginConfig("circuit-breaker",
                "{\"circuitEnable\":true,\"failureRateThreshold\":50,\"waitDurationMs\":1000," +
                "\"permittedCallsInHalfOpen\":5,\"slidingWindowSize\":10,\"minimumNumberOfCalls\":5}", 1));

        // Should not throw
        plugin.onDestroy();

        // After destroy, plugin should pass through (config still set but circuit breakers cleared)
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("circuit-breaker", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
