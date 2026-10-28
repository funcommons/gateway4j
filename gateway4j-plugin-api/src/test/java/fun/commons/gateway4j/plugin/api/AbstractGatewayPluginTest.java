package fun.commons.gateway4j.plugin.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.*;

class AbstractGatewayPluginTest {

    static class TestPlugin extends AbstractGatewayPlugin {

        TestPlugin(String pluginId, String pluginName, String phase, int order) {
            super(pluginId, pluginName, phase, order);
        }

        @Override
        public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
            return Mono.empty();
        }
    }

    private final TestPlugin plugin = new TestPlugin("test", "测试插件", "PRE", 10);

    @Test
    void pluginId() {
        assertEquals("test", plugin.pluginId());
    }

    @Test
    void pluginName() {
        assertEquals("测试插件", plugin.pluginName());
    }

    @Test
    void phase() {
        assertEquals("PRE", plugin.phase());
    }

    @Test
    void order() {
        assertEquals(10, plugin.order());
    }

    @Test
    void skipDefaultFalse() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build();
        assertFalse(plugin.skip(exchange));
    }

    @Test
    void onConfigChangeNoOp() {
        PluginConfig config = new PluginConfig("test", "{}", 1);
        assertDoesNotThrow(() -> plugin.onConfigChange(config));
    }

    @Test
    void onDestroyNoOp() {
        assertDoesNotThrow(() -> plugin.onDestroy());
    }
}
