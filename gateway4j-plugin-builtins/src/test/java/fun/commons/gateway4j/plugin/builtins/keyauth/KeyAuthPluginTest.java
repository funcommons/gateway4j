package fun.commons.gateway4j.plugin.builtins.keyauth;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class KeyAuthPluginTest {

    private KeyAuthPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new KeyAuthPlugin();
    }

    private MockServerWebExchange createExchange(String path, String... headers) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        return MockServerWebExchange.builder(builder.build()).build();
    }

    private MockServerWebExchange createExchangeWithQuery(String path, String query) {
        MockServerHttpRequest request = MockServerHttpRequest.get(path + "?" + query).build();
        return MockServerWebExchange.builder(request).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validKeyInHeaderPasses() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"X-API-Key\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-API-Key", "abc123");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void invalidKeyInHeaderRejects() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"X-API-Key\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-API-Key", "wrong");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void missingKeyInHeaderRejects() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"X-API-Key\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validKeyInQueryParamPasses() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"apiKey\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchangeWithQuery("/test", "apiKey=abc123");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void invalidKeyInQueryParamRejects() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"apiKey\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchangeWithQuery("/test", "apiKey=wrong");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void blankKeyNamePassesThrough() {
        plugin.onConfigChange(new PluginConfig("key-auth",
                "{\"keyName\":\"\",\"key\":\"abc123\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("key-auth", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
