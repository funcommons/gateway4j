package fun.commons.gateway4j.plugin.builtins.cryptor;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class CryptorResponsePluginTest {

    private CryptorResponsePlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new CryptorResponsePlugin();
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
    void noEncryptFieldsPassesThrough() {
        plugin.onConfigChange(new PluginConfig("cryptor-response",
                "{\"secretKey\":\"1234567890123456\"}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("cryptor-response", plugin.pluginId());
        assertEquals("POST", plugin.phase());
    }
}
