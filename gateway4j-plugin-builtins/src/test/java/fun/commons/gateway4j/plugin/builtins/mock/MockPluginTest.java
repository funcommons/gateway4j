package fun.commons.gateway4j.plugin.builtins.mock;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class MockPluginTest {

    private MockPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new MockPlugin();
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
    void mockResponseWithDefaultStatus() {
        plugin.onConfigChange(new PluginConfig("mock",
                "{\"responseContent\":\"{\\\"message\\\":\\\"mocked\\\"}\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(org.springframework.http.HttpStatus.OK, exchange.getResponse().getStatusCode());
        assertTrue(exchange.getResponse().getHeaders().getContentLength() > 0);
    }

    @Test
    void mockResponseWithCustomStatus() {
        plugin.onConfigChange(new PluginConfig("mock",
                "{\"responseContent\":\"{\\\"error\\\":\\\"not found\\\"}\",\"statusCode\":404}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(org.springframework.http.HttpStatus.NOT_FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void mockResponseWithCustomHeaders() {
        plugin.onConfigChange(new PluginConfig("mock",
                "{\"responseContent\":\"ok\",\"responseHeaders\":{\"X-Mock\":\"true\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals("true", exchange.getResponse().getHeaders().getFirst("X-Mock"));
    }

    @Test
    void mockResponseWithCustomContentType() {
        plugin.onConfigChange(new PluginConfig("mock",
                "{\"responseContent\":\"<html></html>\",\"contentType\":\"text/html\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(org.springframework.http.MediaType.TEXT_HTML,
                exchange.getResponse().getHeaders().getContentType());
    }

    @Test
    void nullResponseContentPassesThrough() {
        plugin.onConfigChange(new PluginConfig("mock", "{}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void invalidStatusCodeDefaultsTo200() {
        plugin.onConfigChange(new PluginConfig("mock",
                "{\"responseContent\":\"ok\",\"statusCode\":999}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(org.springframework.http.HttpStatus.OK, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("mock", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
