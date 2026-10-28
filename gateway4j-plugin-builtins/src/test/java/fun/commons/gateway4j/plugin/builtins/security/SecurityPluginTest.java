package fun.commons.gateway4j.plugin.builtins.security;

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

class SecurityPluginTest {

    private SecurityPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new SecurityPlugin();
    }

    private MockServerWebExchange createExchange(String path, String... headers) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        return MockServerWebExchange.builder(builder.build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void ipBlacklistBlocks() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"ipBlacklist\":[\"10.0.0.1\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Real-IP", "10.0.0.1");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void ipBlacklistAllowsNonBlacklisted() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"ipBlacklist\":[\"10.0.0.1\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Real-IP", "10.0.0.2");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void ipWhitelistBlocksNonWhitelisted() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"ipWhitelist\":[\"10.0.0.1\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Real-IP", "10.0.0.2");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void ipWhitelistAllowsWhitelisted() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"ipWhitelist\":[\"10.0.0.1\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Real-IP", "10.0.0.1");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void emptyWhitelistAllowsAll() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"ipWhitelist\":[]}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void requiredHeaderBlocksMissing() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"requiredHeaders\":{\"X-Token\":\"abc123\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void requiredHeaderAllowsMatched() {
        plugin.onConfigChange(new PluginConfig("security",
                "{\"requiredHeaders\":{\"X-Token\":\"abc123\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Token", "abc123");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }
}
