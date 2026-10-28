package fun.commons.gateway4j.plugin.builtins.cache;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class CachePluginTest {

    private CachePlugin prePlugin;
    private CachePlugin postPlugin;

    @BeforeEach
    void setUp() {
        prePlugin = new CachePlugin(false);
        postPlugin = new CachePlugin(true);
    }

    @AfterEach
    void tearDown() {
        prePlugin.onDestroy();
        postPlugin.onDestroy();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();

        StepVerifier.create(prePlugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void prePhaseSetsCacheKeyOnMiss() {
        prePlugin.onConfigChange(new PluginConfig("cache", "{\"ttlSeconds\":300}", 1));

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();

        StepVerifier.create(prePlugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotNull(exchange.getAttribute("gw4j:cache_key"));
        assertNull(exchange.getAttribute("gw4j:cache_hit"));
    }

    @Test
    void prePluginId() {
        assertEquals("cache", prePlugin.pluginId());
        assertEquals("PRE", prePlugin.phase());
    }

    @Test
    void postPluginId() {
        assertEquals("cache-post", postPlugin.pluginId());
        assertEquals("POST", postPlugin.phase());
    }

    @Test
    void configWithTtlSeconds() {
        prePlugin.onConfigChange(new PluginConfig("cache", "{\"ttlSeconds\":600}", 1));
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        StepVerifier.create(prePlugin.execute(exchange, passThroughChain())).verifyComplete();
    }
}
