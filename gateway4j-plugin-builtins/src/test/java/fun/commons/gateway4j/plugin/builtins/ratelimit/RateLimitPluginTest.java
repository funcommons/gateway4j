package fun.commons.gateway4j.plugin.builtins.ratelimit;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class RateLimitPluginTest {

    private RateLimitPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new RateLimitPlugin();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
    }

    @Test
    void allowsBelowLimit() {
        plugin.onConfigChange(new PluginConfig("rate-limiter",
                "{\"limit\":5,\"window\":\"1m\",\"dimension\":\"GLOBAL\"}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
    }

    @Test
    void blocksAboveLimit() {
        plugin.onConfigChange(new PluginConfig("rate-limiter",
                "{\"limit\":2,\"window\":\"1m\",\"dimension\":\"GLOBAL\"}", 1));

        PluginChain chain = passThroughChain();

        // First two requests pass
        MockServerWebExchange ex1 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        MockServerWebExchange ex2 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        MockServerWebExchange ex3 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        StepVerifier.create(plugin.execute(ex1, chain)).verifyComplete();
        StepVerifier.create(plugin.execute(ex2, chain)).verifyComplete();
        StepVerifier.create(plugin.execute(ex3, chain)).verifyComplete();

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex3.getResponse().getStatusCode());
    }

    @Test
    void perIpDimensionUsesDifferentKeys() {
        plugin.onConfigChange(new PluginConfig("rate-limiter",
                "{\"limit\":1,\"window\":\"1m\",\"dimension\":\"IP\"}", 1));

        PluginChain chain = passThroughChain();

        MockServerWebExchange ex1 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").remoteAddress(
                        new java.net.InetSocketAddress("10.0.0.1", 8080)).build()).build();
        MockServerWebExchange ex2 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").remoteAddress(
                        new java.net.InetSocketAddress("10.0.0.2", 8080)).build()).build();

        StepVerifier.create(plugin.execute(ex1, chain)).verifyComplete();
        StepVerifier.create(plugin.execute(ex2, chain)).verifyComplete();

        // Both should pass since they have different IPs
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, ex2.getResponse().getStatusCode());
    }
}
