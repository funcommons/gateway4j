package fun.commons.gateway4j.plugin.builtins.sentinel;

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

class SentinelPluginTest {

    private SentinelPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new SentinelPlugin();
    }

    @AfterEach
    void tearDown() {
        plugin.onDestroy();
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
        assertNotEquals(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
                exchange.getResponse().getStatusCode());
    }

    @Test
    void configWithFlowRulesLoadsRules() {
        plugin.onConfigChange(new PluginConfig("sentinel",
                "{\"flowRules\":[{\"resource\":\"test-resource\",\"count\":100,\"grade\":1}]}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void configWithDegradeRulesLoadsRules() {
        plugin.onConfigChange(new PluginConfig("sentinel",
                "{\"degradeRules\":[{\"resource\":\"test-resource\",\"grade\":0,\"count\":0.5,\"timeWindow\":10}]}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void resourceModeRoute() {
        plugin.onConfigChange(new PluginConfig("sentinel",
                "{\"resourceMode\":\"ROUTE\",\"flowRules\":[{\"resource\":\"/api/users\",\"count\":100}]}", 1));

        MockServerWebExchange exchange = createExchange("/api/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void resourceModeGlobal() {
        plugin.onConfigChange(new PluginConfig("sentinel",
                "{\"resourceMode\":\"GLOBAL\",\"flowRules\":[{\"count\":100}]}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void destroyClearsRules() {
        plugin.onConfigChange(new PluginConfig("sentinel",
                "{\"flowRules\":[{\"resource\":\"test\",\"count\":100}]}", 1));
        plugin.onDestroy();

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("sentinel", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
