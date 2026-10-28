package fun.commons.gateway4j.plugin.builtins.tracing;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class TracingPluginTest {

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void prePhaseGeneratesTraceId() {
        TracingPlugin plugin = new TracingPlugin(false);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        String traceId = exchange.getAttribute(GatewayConstants.TRACE_ID_KEY);
        assertNotNull(traceId);
        assertEquals(32, traceId.length());
    }

    @Test
    void prePhaseExtractsExistingTraceId() {
        TracingPlugin plugin = new TracingPlugin(false);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test")
                        .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                        .build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        String traceId = exchange.getAttribute(GatewayConstants.TRACE_ID_KEY);
        assertNotNull(traceId);
        assertEquals("0af7651916cd43dd8448eb211c80319c", traceId);
    }

    @Test
    void postPhaseCompletes() {
        TracingPlugin plugin = new TracingPlugin(true);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void prePluginId() {
        TracingPlugin plugin = new TracingPlugin(false);
        assertEquals("tracing", plugin.pluginId());
    }

    @Test
    void postPluginId() {
        TracingPlugin plugin = new TracingPlugin(true);
        assertEquals("tracing-post", plugin.pluginId());
    }
}
