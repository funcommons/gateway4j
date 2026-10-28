package fun.commons.gateway4j.plugin.builtins.request;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class RequestPluginTest {

    private RequestPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new RequestPlugin();
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

    private PluginChain capturingChain(AtomicReference<org.springframework.web.server.ServerWebExchange> captured) {
        return exchange -> { captured.set(exchange); return Mono.empty(); };
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void addHeaders() {
        plugin.onConfigChange(new PluginConfig("request",
                "{\"addHeaders\":{\"X-Custom\":\"value1\",\"X-Another\":\"value2\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("value1", captured.get().getRequest().getHeaders().getFirst("X-Custom"));
        assertEquals("value2", captured.get().getRequest().getHeaders().getFirst("X-Another"));
    }

    @Test
    void replaceHeaders() {
        plugin.onConfigChange(new PluginConfig("request",
                "{\"replaceHeaders\":{\"X-Existing\":\"new-value\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Existing", "old-value");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("new-value", captured.get().getRequest().getHeaders().getFirst("X-Existing"));
    }

    @Test
    void removeHeaders() {
        plugin.onConfigChange(new PluginConfig("request",
                "{\"removeHeaders\":[\"X-Remove\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Remove", "value", "X-Keep", "keep");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertNull(captured.get().getRequest().getHeaders().getFirst("X-Remove"));
        assertEquals("keep", captured.get().getRequest().getHeaders().getFirst("X-Keep"));
    }

    @Test
    void addQueryParams() {
        plugin.onConfigChange(new PluginConfig("request",
                "{\"addQueryParams\":{\"extra\":\"val\"}}", 1));

        MockServerWebExchange exchange = createExchange("/test?existing=yes");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        String query = captured.get().getRequest().getURI().getQuery();
        assertNotNull(query);
        assertTrue(query.contains("existing=yes"));
        assertTrue(query.contains("extra=val"));
    }

    @Test
    void removeQueryParams() {
        plugin.onConfigChange(new PluginConfig("request",
                "{\"removeQueryParams\":[\"remove\"]}", 1));

        MockServerWebExchange exchange = createExchange("/test?remove=yes&keep=yes");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        String query = captured.get().getRequest().getURI().getQuery();
        assertNotNull(query);
        assertTrue(query.contains("keep=yes"));
        assertFalse(query.contains("remove="));
    }

    @Test
    void emptyConfigPassesThrough() {
        plugin.onConfigChange(new PluginConfig("request", "{}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/test", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("request", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
