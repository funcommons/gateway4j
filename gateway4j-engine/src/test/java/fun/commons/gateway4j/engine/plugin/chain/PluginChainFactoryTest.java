package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PluginChainFactoryTest {

    private MockServerWebExchange createExchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/test").build()).build();
    }

    static class OrderPlugin implements GatewayPlugin {
        private final String id;
        private final int order;
        private final List<String> log;

        OrderPlugin(String id, int order, List<String> log) {
            this.id = id;
            this.order = order;
            this.log = log;
        }

        @Override public String pluginId() { return id; }
        @Override public String pluginName() { return id; }
        @Override public String phase() { return "PRE"; }
        @Override public int order() { return order; }

        @Override
        public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
            log.add(id);
            return chain.execute(exchange);
        }
    }

    @Test
    void buildChainSortsByOrder() {
        List<String> log = new ArrayList<>();
        List<GatewayPlugin> plugins = List.of(
                new OrderPlugin("c", 30, log),
                new OrderPlugin("a", 10, log),
                new OrderPlugin("b", 20, log)
        );

        PluginChainFactory factory = new PluginChainFactory();
        PluginChain chain = factory.buildChain(plugins);
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("a", "b", "c"), log);
    }

    @Test
    void buildChainReversed() {
        List<String> log = new ArrayList<>();
        List<GatewayPlugin> plugins = List.of(
                new OrderPlugin("a", 10, log),
                new OrderPlugin("b", 20, log),
                new OrderPlugin("c", 30, log)
        );

        PluginChainFactory factory = new PluginChainFactory();
        PluginChain chain = factory.buildChainReversed(plugins);
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("c", "b", "a"), log);
    }

    @Test
    void emptyListProducesEmptyChain() {
        PluginChainFactory factory = new PluginChainFactory();
        PluginChain chain = factory.buildChain(List.of());
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
    }
}
