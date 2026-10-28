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
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DefaultPluginChainTest {

    private MockServerWebExchange createExchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/test").build()).build();
    }

    static class TrackingPlugin implements GatewayPlugin {
        private final String id;
        private final int order;
        private final List<String> executionLog;
        private final boolean shouldSkip;

        TrackingPlugin(String id, int order, List<String> executionLog) {
            this(id, order, executionLog, false);
        }

        TrackingPlugin(String id, int order, List<String> executionLog, boolean shouldSkip) {
            this.id = id;
            this.order = order;
            this.executionLog = executionLog;
            this.shouldSkip = shouldSkip;
        }

        @Override public String pluginId() { return id; }
        @Override public String pluginName() { return id; }
        @Override public String phase() { return "PRE"; }
        @Override public int order() { return order; }

        @Override
        public boolean skip(ServerWebExchange exchange) {
            return shouldSkip;
        }

        @Override
        public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
            executionLog.add(id);
            return chain.execute(exchange);
        }
    }

    @Test
    void sequentialExecution() {
        List<String> log = new ArrayList<>();
        List<GatewayPlugin> plugins = List.of(
                new TrackingPlugin("a", 1, log),
                new TrackingPlugin("b", 2, log),
                new TrackingPlugin("c", 3, log)
        );

        DefaultPluginChain chain = new DefaultPluginChain(plugins);
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("a", "b", "c"), log);
    }

    @Test
    void skippedPluginNotExecuted() {
        List<String> log = new ArrayList<>();
        List<GatewayPlugin> plugins = List.of(
                new TrackingPlugin("a", 1, log),
                new TrackingPlugin("b", 2, log, true),
                new TrackingPlugin("c", 3, log)
        );

        DefaultPluginChain chain = new DefaultPluginChain(plugins);
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("a", "c"), log);
    }

    @Test
    void emptyChainCompletes() {
        DefaultPluginChain chain = new DefaultPluginChain(Collections.emptyList());
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
    }

    @Test
    void singlePluginChain() {
        List<String> log = new ArrayList<>();
        List<GatewayPlugin> plugins = List.of(new TrackingPlugin("only", 1, log));
        DefaultPluginChain chain = new DefaultPluginChain(plugins);
        StepVerifier.create(chain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("only"), log);
    }
}
