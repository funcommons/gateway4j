package fun.commons.gateway4j.plugin.builtins.retry;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class RetryPluginTest {

    private RetryPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new RetryPlugin();
    }

    private MockServerWebExchange createExchange(String path) {
        return MockServerWebExchange.builder(MockServerHttpRequest.get(path).build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void zeroRetryCountPassesThrough() {
        plugin.onConfigChange(new PluginConfig("retry",
                "{\"retryCount\":0}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void fixedRetrySucceedsOnFirstAttempt() {
        plugin.onConfigChange(new PluginConfig("retry",
                "{\"retryCount\":3,\"strategy\":\"FIXED\",\"waitDurationMs\":10}", 1));

        AtomicInteger attempts = new AtomicInteger(0);
        PluginChain chain = exchange -> {
            attempts.incrementAndGet();
            return Mono.empty();
        };

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, chain)).verifyComplete();
        assertEquals(1, attempts.get());
    }

    @Test
    void exponentialRetryConfig() {
        plugin.onConfigChange(new PluginConfig("retry",
                "{\"retryCount\":2,\"strategy\":\"EXPONENTIAL\",\"waitDurationMs\":10,\"multiplier\":2.0}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void failoverConfig() {
        plugin.onConfigChange(new PluginConfig("retry",
                "{\"retryCount\":2,\"strategy\":\"FAILOVER\",\"failoverUpstream\":\"http://backup:8080\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void failoverWithoutUpstreamFallsBackToFixed() {
        plugin.onConfigChange(new PluginConfig("retry",
                "{\"retryCount\":2,\"strategy\":\"FAILOVER\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("retry", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
