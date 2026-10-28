package fun.commons.gateway4j.plugin.builtins.sign;

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

class SignPluginTest {

    private SignPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new SignPlugin();
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
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void missingSignHeadersRejects() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void missingAppKeyHeaderRejects() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\"}", 1));

        MockServerWebExchange exchange = createExchange("/test",
                "timestamp", String.valueOf(System.currentTimeMillis()),
                "sign", "somesignature");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void expiredTimestampRejects() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\",\"delayMinutes\":5}", 1));

        long expiredTimestamp = System.currentTimeMillis() - 600000; // 10 min ago
        MockServerWebExchange exchange = createExchange("/test",
                "appKey", "test-app",
                "timestamp", String.valueOf(expiredTimestamp),
                "sign", "somesignature");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void mismatchedAppKeyRejects() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\"}", 1));

        MockServerWebExchange exchange = createExchange("/test",
                "appKey", "wrong-app",
                "timestamp", String.valueOf(System.currentTimeMillis()),
                "sign", "somesignature");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validSignaturePasses() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\"}", 1));

        String timestamp = String.valueOf(System.currentTimeMillis());
        String sign = plugin.generateSign("test-secret", "test-app", timestamp, "/test", "HmacSHA256");

        MockServerWebExchange exchange = createExchange("/test",
                "appKey", "test-app",
                "timestamp", timestamp,
                "sign", sign);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void generateSignProducesConsistentOutput() {
        String sign1 = plugin.generateSign("secret", "appKey", "1234567890", "/api/users", "HmacSHA256");
        String sign2 = plugin.generateSign("secret", "appKey", "1234567890", "/api/users", "HmacSHA256");
        assertNotNull(sign1);
        assertFalse(sign1.isEmpty());
        assertEquals(sign1, sign2);
        assertTrue(sign1.matches("[0-9a-f]+")); // hex string
    }

    @Test
    void generateSignDiffersForDifferentInputs() {
        String sign1 = plugin.generateSign("secret", "appKey1", "1234567890", "/api/users", "HmacSHA256");
        String sign2 = plugin.generateSign("secret", "appKey2", "1234567890", "/api/users", "HmacSHA256");
        assertNotEquals(sign1, sign2);
    }

    @Test
    void blankAppKeyInConfigPassesThrough() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"\",\"appSecret\":\"\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void customHeaderNamesWork() {
        plugin.onConfigChange(new PluginConfig("sign",
                "{\"appKey\":\"test-app\",\"appSecret\":\"test-secret\"," +
                "\"appKeyHeader\":\"X-App-Key\",\"timestampHeader\":\"X-Timestamp\",\"signHeader\":\"X-Sign\"}", 1));

        String timestamp = String.valueOf(System.currentTimeMillis());
        String sign = plugin.generateSign("test-secret", "test-app", timestamp, "/test", "HmacSHA256");

        MockServerWebExchange exchange = createExchange("/test",
                "X-App-Key", "test-app",
                "X-Timestamp", timestamp,
                "X-Sign", sign);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("sign", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
