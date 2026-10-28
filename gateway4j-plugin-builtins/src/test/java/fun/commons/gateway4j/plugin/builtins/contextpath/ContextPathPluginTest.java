package fun.commons.gateway4j.plugin.builtins.contextpath;

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

class ContextPathPluginTest {

    private ContextPathPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new ContextPathPlugin();
    }

    private MockServerWebExchange createExchange(String path) {
        return MockServerWebExchange.builder(MockServerHttpRequest.get(path).build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    private PluginChain capturingChain(AtomicReference<org.springframework.web.server.ServerWebExchange> captured) {
        return exchange -> { captured.set(exchange); return Mono.empty(); };
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/api/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void addPrefix() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"addPrefix\":\"/v2\"}", 1));

        MockServerWebExchange exchange = createExchange("/api/users");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/v2/api/users", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void addPrefixWithoutLeadingSlash() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"addPrefix\":\"v2\"}", 1));

        MockServerWebExchange exchange = createExchange("/api/users");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/v2/api/users", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void stripPrefix() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"stripPrefix\":1}", 1));

        MockServerWebExchange exchange = createExchange("/api/users/list");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/users/list", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void stripPrefixMultiple() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"stripPrefix\":2}", 1));

        MockServerWebExchange exchange = createExchange("/api/v1/users/list");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/users/list", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void stripPrefixExceedsSegments() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"stripPrefix\":10}", 1));

        MockServerWebExchange exchange = createExchange("/api/users");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void addPrefixAndStripPrefix() {
        plugin.onConfigChange(new PluginConfig("context-path",
                "{\"addPrefix\":\"/v2\",\"stripPrefix\":1}", 1));

        MockServerWebExchange exchange = createExchange("/api/users/list");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/v2/users/list", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void noChangePassesThrough() {
        plugin.onConfigChange(new PluginConfig("context-path", "{}", 1));

        MockServerWebExchange exchange = createExchange("/api/users");
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("/api/users", captured.get().getRequest().getURI().getRawPath());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("context-path", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
