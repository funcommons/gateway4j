package fun.commons.gateway4j.plugin.builtins.modifyresponse;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class ModifyResponsePluginTest {

    private ModifyResponsePlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new ModifyResponsePlugin();
    }

    private MockServerWebExchange createExchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/test").build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void addHeadersToResponse() {
        plugin.onConfigChange(new PluginConfig("modify-response",
                "{\"addHeaders\":{\"X-Custom\":\"value\"}}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals("value", exchange.getResponse().getHeaders().getFirst("X-Custom"));
    }

    @Test
    void replaceHeadersInResponse() {
        plugin.onConfigChange(new PluginConfig("modify-response",
                "{\"replaceHeaders\":{\"Content-Type\":\"text/plain\"}}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals("text/plain", exchange.getResponse().getHeaders().getFirst("Content-Type"));
    }

    @Test
    void removeHeadersFromResponse() {
        plugin.onConfigChange(new PluginConfig("modify-response",
                "{\"removeHeaders\":[\"X-Remove\"]}", 1));

        MockServerWebExchange exchange = createExchange();
        exchange.getResponse().getHeaders().add("X-Remove", "value");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNull(exchange.getResponse().getHeaders().getFirst("X-Remove"));
    }

    @Test
    void modifyStatusCode() {
        plugin.onConfigChange(new PluginConfig("modify-response",
                "{\"statusCode\":201}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(org.springframework.http.HttpStatus.CREATED, exchange.getResponse().getStatusCode());
    }

    @Test
    void invalidStatusCodeIgnored() {
        plugin.onConfigChange(new PluginConfig("modify-response",
                "{\"statusCode\":999}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void emptyConfigPassesThrough() {
        plugin.onConfigChange(new PluginConfig("modify-response", "{}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("modify-response", plugin.pluginId());
        assertEquals("POST", plugin.phase());
    }
}
