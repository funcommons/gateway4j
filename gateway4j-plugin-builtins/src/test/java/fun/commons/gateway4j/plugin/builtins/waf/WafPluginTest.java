package fun.commons.gateway4j.plugin.builtins.waf;

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

class WafPluginTest {

    private WafPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new WafPlugin();
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
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void blackModeNoRuleAllowsAll() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"black\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void mixedModeNoRuleRejectsAll() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"mixed\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void blackModeWithRejectRuleBlocks() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"black\",\"permission\":\"reject\",\"statusCode\":\"403\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void mixedModeWithAllowRulePasses() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"mixed\",\"permission\":\"allow\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void rejectWithCustomStatusCode() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"black\",\"permission\":\"reject\",\"statusCode\":429}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
    }

    @Test
    void blackModeWithAllowRulePasses() {
        plugin.onConfigChange(new PluginConfig("waf",
                "{\"model\":\"black\",\"permission\":\"allow\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void defaultModelIsBlack() {
        plugin.onConfigChange(new PluginConfig("waf", "{}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("waf", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
