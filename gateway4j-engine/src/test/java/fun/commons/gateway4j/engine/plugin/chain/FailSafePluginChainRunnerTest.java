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
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class FailSafePluginChainRunnerTest {

    private List<String> log = new ArrayList<>();

    private MockServerWebExchange exchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/api/x").build()).build();
    }

    private GatewayPlugin plugin(String id, List<String> log) {
        return new GatewayPlugin() {
            @Override public String pluginId() { return id; }
            @Override public String pluginName() { return id; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                log.add(id);
                return chain.execute(ex);
            }
        };
    }

    @Test
    void executesInOrderThenContinuation() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(
                plugin("p1", log), plugin("p2", log)));

        StepVerifier.create(runner.execute(exchange, Mono.fromRunnable(forwarded::incrementAndGet)))
                .verifyComplete();

        assertEquals(List.of("p1", "p2"), log);
        assertEquals(1, forwarded.get());
    }

    @Test
    void synchronousPluginFailureIsFailOpen() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        GatewayPlugin boom = new GatewayPlugin() {
            @Override public String pluginId() { return "boom"; }
            @Override public String pluginName() { return "boom"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                throw new IllegalStateException("plugin exploded");
            }
        };

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(
                boom, plugin("after", log)));

        StepVerifier.create(runner.execute(exchange, Mono.fromRunnable(forwarded::incrementAndGet)))
                .verifyComplete();

        assertEquals(List.of("after"), log);
        assertEquals(1, forwarded.get());
    }

    @Test
    void asynchronousPluginFailureIsFailOpen() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        GatewayPlugin boom = new GatewayPlugin() {
            @Override public String pluginId() { return "boom-async"; }
            @Override public String pluginName() { return "boom-async"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return Mono.error(new IllegalStateException("async explosion"));
            }
        };

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(
                boom, plugin("after", log)));

        StepVerifier.create(runner.execute(exchange, Mono.fromRunnable(forwarded::incrementAndGet)))
                .verifyComplete();

        assertEquals(List.of("after"), log);
        assertEquals(1, forwarded.get());
    }

    @Test
    void failureAfterForwardStartedPropagatesInsteadOfReforwarding() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        // Delegates to the chain (forwarding starts and fails), then errors itself.
        GatewayPlugin evil = new GatewayPlugin() {
            @Override public String pluginId() { return "evil"; }
            @Override public String pluginName() { return "evil"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return chain.execute(ex).then(Mono.error(new IllegalStateException("late failure")));
            }
        };

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(evil));
        Mono<Void> failingForward = Mono.fromRunnable(forwarded::incrementAndGet)
                .then(Mono.error(new IllegalStateException("upstream down")));

        StepVerifier.create(runner.execute(exchange, failingForward))
                .verifyError(IllegalStateException.class);

        assertEquals(1, forwarded.get(), "forward must not be retried");
    }

    @Test
    void skipIsHonoured() {
        MockServerWebExchange exchange = exchange();
        GatewayPlugin skipping = new GatewayPlugin() {
            @Override public String pluginId() { return "skipme"; }
            @Override public String pluginName() { return "skipme"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public boolean skip(ServerWebExchange ex) { return true; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                log.add("skipme");
                return chain.execute(ex);
            }
        };

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(skipping));
        StepVerifier.create(runner.execute(exchange, Mono.empty())).verifyComplete();

        assertTrue(log.isEmpty());
    }
}
