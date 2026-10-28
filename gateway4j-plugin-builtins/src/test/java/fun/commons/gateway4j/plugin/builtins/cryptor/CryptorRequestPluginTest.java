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

class CryptorRequestPluginTest {

    private CryptorRequestPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new CryptorRequestPlugin();
    }

    private MockServerWebExchange createExchange(String body) {
        MockServerHttpRequest request = MockServerHttpRequest.post("/test")
                .header("Content-Type", "application/json")
                .body(body);
        return MockServerWebExchange.builder(request).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("{\"name\":\"test\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void noDecryptFieldsPassesThrough() {
        plugin.onConfigChange(new PluginConfig("cryptor-request",
                "{\"secretKey\":\"1234567890123456\"}", 1));

        MockServerWebExchange exchange = createExchange("{\"name\":\"test\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void nonJsonContentTypePassesThrough() {
        plugin.onConfigChange(new PluginConfig("cryptor-request",
                "{\"secretKey\":\"1234567890123456\",\"decryptFields\":[\"$.password\"]}", 1));

        MockServerHttpRequest request = MockServerHttpRequest.post("/test")
                .header("Content-Type", "text/plain")
                .body("some text");
        MockServerWebExchange exchange = MockServerWebExchange.builder(request).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("cryptor-request", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
