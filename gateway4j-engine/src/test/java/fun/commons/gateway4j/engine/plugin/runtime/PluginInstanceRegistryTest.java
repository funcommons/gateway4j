package fun.commons.gateway4j.engine.plugin.runtime;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class PluginInstanceRegistryTest {

    @Test
    void applyPluginConfigsPushesConfigToInstances() {
        AtomicReference<String> received = new AtomicReference<>();
        GatewayPlugin mock = new GatewayPlugin() {
            @Override public String pluginId() { return "mock"; }
            @Override public String pluginName() { return "mock"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                return chain.execute(exchange);
            }
            @Override public void onConfigChange(fun.commons.gateway4j.plugin.api.PluginConfig config) {
                received.set(config.config());
            }
        };
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        registry.register(mock);

        Plugin row = Plugin.builder().id(1L).pluginId("mock").pluginType("BUILTIN")
                .status("ENABLED").config("{\"statusCode\":200}").configVersion(3L).build();
        registry.applyPluginConfigs(List.of(row));

        assertEquals("{\"statusCode\":200}", received.get());
    }

    @Test
    void brokenPluginConfigIsFailOpen() {
        GatewayPlugin boom = new GatewayPlugin() {
            @Override public String pluginId() { return "boom"; }
            @Override public String pluginName() { return "boom"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                return chain.execute(exchange);
            }
            @Override public void onConfigChange(fun.commons.gateway4j.plugin.api.PluginConfig config) {
                throw new RuntimeException("bad config");
            }
        };
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        registry.register(boom);

        Plugin row = Plugin.builder().id(1L).pluginId("boom").pluginType("BUILTIN")
                .status("ENABLED").config("{invalid").build();

        assertDoesNotThrow(() -> registry.applyPluginConfigs(List.of(row)));
    }

    @Test
    void unknownPluginIdIsNotRegistered() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        assertFalse(registry.isRegistered("whatever"));
        assertNull(registry.find("whatever"));

        Plugin row = Plugin.builder().id(1L).pluginId("whatever").pluginType("GROOVY")
                .status("ENABLED").config("{}").build();
        assertDoesNotThrow(() -> registry.applyPluginConfigs(List.of(row)));
    }
}
