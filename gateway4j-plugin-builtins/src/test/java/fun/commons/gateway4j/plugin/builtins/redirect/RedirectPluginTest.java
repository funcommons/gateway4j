package fun.commons.gateway4j.plugin.builtins.redirect;

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

class RedirectPluginTest {

    private RedirectPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new RedirectPlugin();
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
        assertNotEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void externalRedirectSetsLocationHeader() {
        plugin.onConfigChange(new PluginConfig("redirect",
                "{\"redirectURI\":\"https://example.com/new\",\"httpStatusCode\":302}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
        assertEquals("https://example.com/new", exchange.getResponse().getHeaders().getFirst("Location"));
    }

    @Test
    void redirectWith301Status() {
        plugin.onConfigChange(new PluginConfig("redirect",
                "{\"redirectURI\":\"https://example.com/permanent\",\"httpStatusCode\":301}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.MOVED_PERMANENTLY, exchange.getResponse().getStatusCode());
        assertEquals("https://example.com/permanent", exchange.getResponse().getHeaders().getFirst("Location"));
    }

    @Test
    void emptyRedirectURIPassesThrough() {
        plugin.onConfigChange(new PluginConfig("redirect",
                "{\"redirectURI\":\"\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void defaultStatusCodeIs302() {
        plugin.onConfigChange(new PluginConfig("redirect",
                "{\"redirectURI\":\"https://example.com\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("redirect", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
