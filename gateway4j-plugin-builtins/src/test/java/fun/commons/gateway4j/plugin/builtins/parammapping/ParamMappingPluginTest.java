package fun.commons.gateway4j.plugin.builtins.parammapping;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class ParamMappingPluginTest {

    private ParamMappingPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new ParamMappingPlugin();
    }

    private MockServerWebExchange createJsonExchange(String path, String body) {
        MockServerHttpRequest request = MockServerHttpRequest.post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
        return MockServerWebExchange.builder(request).build();
    }

    private MockServerWebExchange createFormExchange(String path, String body) {
        MockServerHttpRequest request = MockServerHttpRequest.post(path)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(body);
        return MockServerWebExchange.builder(request).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createJsonExchange("/test", "{}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void addParameterToJsonBody() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"addParameterKeys\":[{\"path\":\"$\",\"key\":\"version\",\"value\":\"2\"}]}",
                1));

        MockServerWebExchange exchange = createJsonExchange("/test", "{\"name\":\"test\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void removeParameterFromJsonBody() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"removeParameterKeys\":[\"$.password\"]}",
                1));

        MockServerWebExchange exchange = createJsonExchange("/test", "{\"name\":\"test\",\"password\":\"secret\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void replaceParameterInJsonBody() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"replaceParameterKeys\":[{\"path\":\"$.name\",\"key\":\"name\",\"value\":\"renamed\"}]}",
                1));

        MockServerWebExchange exchange = createJsonExchange("/test", "{\"name\":\"old\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void emptyConfigPassesThrough() {
        plugin.onConfigChange(new PluginConfig("param-mapping", "{}", 1));

        MockServerWebExchange exchange = createJsonExchange("/test", "{\"name\":\"test\"}");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void nonJsonNonFormContentTypePassesThrough() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"addParameterKeys\":[{\"path\":\"$\",\"key\":\"version\",\"value\":\"2\"}]}",
                1));

        MockServerHttpRequest request = MockServerHttpRequest.post("/test")
                .contentType(MediaType.TEXT_PLAIN)
                .body("plain text");
        MockServerWebExchange exchange = MockServerWebExchange.builder(request).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void formUrlencodedAddParameter() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"addParameterKeys\":[{\"key\":\"version\",\"value\":\"2\"}]}",
                1));

        MockServerWebExchange exchange = createFormExchange("/test", "name=test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void formUrlencodedRemoveParameter() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"removeParameterKeys\":[\"password\"]}",
                1));

        MockServerWebExchange exchange = createFormExchange("/test", "name=test&password=secret");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void formUrlencodedReplaceParameter() {
        plugin.onConfigChange(new PluginConfig("param-mapping",
                "{\"replaceParameterKeys\":[{\"key\":\"name\",\"value\":\"renamed\"}]}",
                1));

        MockServerWebExchange exchange = createFormExchange("/test", "name=old");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void formUrlencodedNoOperationsPassesThrough() {
        plugin.onConfigChange(new PluginConfig("param-mapping", "{}", 1));

        MockServerWebExchange exchange = createFormExchange("/test", "name=test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("param-mapping", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
