package fun.commons.gateway4j.plugin.builtins.sharing;

import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class SharingPluginTest {

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void prePhaseCompletes() {
        SharingPlugin plugin = new SharingPlugin(false);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void postPhaseCompletes() {
        SharingPlugin plugin = new SharingPlugin(true);
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void setAndGetSharedData() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        SharingPlugin.setSharedData(exchange, "userId", "user-123");
        String value = SharingPlugin.getSharedData(exchange, "userId");
        assertEquals("user-123", value);
    }

    @Test
    void getMissingSharedDataReturnsNull() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();

        assertNull(SharingPlugin.getSharedData(exchange, "nonexistent"));
    }

    @Test
    void prePluginId() {
        SharingPlugin plugin = new SharingPlugin(false);
        assertEquals("sharing", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }

    @Test
    void postPluginId() {
        SharingPlugin plugin = new SharingPlugin(true);
        assertEquals("sharing-post", plugin.pluginId());
        assertEquals("POST", plugin.phase());
    }
}
