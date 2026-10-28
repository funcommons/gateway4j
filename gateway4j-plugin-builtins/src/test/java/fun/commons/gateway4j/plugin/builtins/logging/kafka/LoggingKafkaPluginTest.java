package fun.commons.gateway4j.plugin.builtins.logging.kafka;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class LoggingKafkaPluginTest {

    private LoggingKafkaPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new LoggingKafkaPlugin();
    }

    private MockServerWebExchange createExchange(String path) {
        MockServerHttpRequest request = MockServerHttpRequest.get(path).build();
        return MockServerWebExchange.builder(request).build();
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
    void withConfigPassesThroughEvenWithoutKafka() {
        plugin.onConfigChange(new PluginConfig("logging-kafka",
                "{\"bootstrapServer\":\"localhost:9092\",\"topic\":\"gateway-logs\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("logging-kafka", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
