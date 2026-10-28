package fun.commons.gateway4j.plugin.builtins.logging;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class LoggingPluginTest {

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void prePhaseSetsStartTime() {
        LoggingPlugin plugin = new LoggingPlugin(false);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertTrue(exchange.getAttributes().containsKey(GatewayConstants.REQUEST_START_TIME_KEY));
    }

    @Test
    void postPhaseCompletes() {
        LoggingPlugin plugin = new LoggingPlugin(true);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void prePluginId() {
        LoggingPlugin plugin = new LoggingPlugin(false);
        assertEquals("logging", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }

    @Test
    void postPluginId() {
        LoggingPlugin plugin = new LoggingPlugin(true);
        assertEquals("logging-post", plugin.pluginId());
        assertEquals("POST", plugin.phase());
    }
}
