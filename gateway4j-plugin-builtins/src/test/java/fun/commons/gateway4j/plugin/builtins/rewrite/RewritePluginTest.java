package fun.commons.gateway4j.plugin.builtins.rewrite;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class RewritePluginTest {

    private RewritePlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new RewritePlugin();
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
    void regexRewriteChangesPath() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"/api/v1/(.*)\",\"replace\":\"/api/v2/$1\"}", 1));

        MockServerWebExchange exchange = createExchange("/api/v1/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertNotNull(rewrittenUri);
        assertTrue(rewrittenUri.contains("/api/v2/users"));
    }

    @Test
    void regexNoMatchPassesThrough() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"/api/v1/(.*)\",\"replace\":\"/api/v2/$1\"}", 1));

        MockServerWebExchange exchange = createExchange("/other/path");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertNull(rewrittenUri);
    }

    @Test
    void percentageZeroDoesNotRewrite() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"/api/v1/(.*)\",\"replace\":\"/api/v2/$1\",\"percentage\":0}", 1));

        MockServerWebExchange exchange = createExchange("/api/v1/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertNull(rewrittenUri);
    }

    @Test
    void percentage100AlwaysRewrites() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"/api/v1/(.*)\",\"replace\":\"/api/v2/$1\",\"percentage\":100}", 1));

        MockServerWebExchange exchange = createExchange("/api/v1/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertNotNull(rewrittenUri);
    }

    @Test
    void emptyRegexPassesThrough() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"\",\"replace\":\"/new\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertNull(rewrittenUri);
    }

    @Test
    void emptyReplaceStripsPrefix() {
        // 刚需场景：分发子路由前缀剥离 /svc-a/** -> /**，replace 必须允许空串
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"^/svc-a\",\"replace\":\"\",\"percentage\":100}", 1));

        MockServerWebExchange exchange = createExchange("/svc-a/users/1");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        String rewrittenUri = exchange.getAttribute("gw4j:rewrite_uri");
        assertEquals("/users/1", rewrittenUri);
    }

    @Test
    void emptyReplaceOnNonMatchingPathPassesThrough() {
        plugin.onConfigChange(new PluginConfig("rewrite",
                "{\"regex\":\"^/svc-a\",\"replace\":\"\",\"percentage\":100}", 1));

        MockServerWebExchange exchange = createExchange("/other/path");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        assertNull(exchange.getAttribute("gw4j:rewrite_uri"));
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("rewrite", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
