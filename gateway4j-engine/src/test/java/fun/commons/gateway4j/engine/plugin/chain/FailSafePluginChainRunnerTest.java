package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

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

    /** Plugin whose async step explodes before delegating. */
    private GatewayPlugin asyncBoom(String id) {
        return new GatewayPlugin() {
            @Override public String pluginId() { return id; }
            @Override public String pluginName() { return id; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return Mono.error(new IllegalStateException(id + " exploded"));
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

    // ------------------------------------------------------------------
    // P1-2: plugin execution stats
    // ------------------------------------------------------------------

    @Test
    void executionStatsCountOkSkippedAndError() {
        MockServerWebExchange exchange = exchange();
        PluginExecutionStats stats = new PluginExecutionStats();

        GatewayPlugin boom = new GatewayPlugin() {
            @Override public String pluginId() { return "boom"; }
            @Override public String pluginName() { return "boom-name"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                throw new IllegalStateException("sync explosion");
            }
        };
        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(
                List.of(plugin("ok-plugin", log), boom, asyncBoom("boom-async")), stats);
        StepVerifier.create(runner.execute(exchange, Mono.empty())).verifyComplete();

        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("ok-plugin"));
        assertArrayEquals(new long[]{0, 0, 1}, stats.statsFor("boom"));
        assertArrayEquals(new long[]{0, 0, 1}, stats.statsFor("boom-async"));
    }

    @Test
    void selfSkippingPluginCountsAsSkipped() {
        MockServerWebExchange exchange = exchange();
        PluginExecutionStats stats = new PluginExecutionStats();
        GatewayPlugin skipping = new GatewayPlugin() {
            @Override public String pluginId() { return "skipme"; }
            @Override public String pluginName() { return "skipme"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public boolean skip(ServerWebExchange ex) { return true; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return chain.execute(ex);
            }
        };

        new FailSafePluginChainRunner(List.of(skipping), stats)
                .execute(exchange, Mono.empty()).block();

        assertArrayEquals(new long[]{0, 1, 0}, stats.statsFor("skipme"));
    }

    @Test
    void forwardFailureIsNotCountedAsPluginError() {
        MockServerWebExchange exchange = exchange();
        PluginExecutionStats stats = new PluginExecutionStats();
        AtomicInteger forwarded = new AtomicInteger();

        // plugin delegates (forward starts, fails) — the error passes through this
        // plugin's boundary but belongs to the forward, not the plugin
        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(plugin("p1", log)), stats);
        Mono<Void> failingForward = Mono.fromRunnable(forwarded::incrementAndGet)
                .then(Mono.error(new IllegalStateException("upstream down")));

        StepVerifier.create(runner.execute(exchange, failingForward))
                .verifyError(IllegalStateException.class);

        assertArrayEquals(new long[]{0, 0, 0}, stats.statsFor("p1"),
                "forward failure must not be attributed to the plugin");
    }

    // ------------------------------------------------------------------
    // P1-2: on_error=close short-circuit
    // ------------------------------------------------------------------

    private GatewayPlugin configured(String id, String configJson, List<String> log) {
        return new ConfiguredPlugin(plugin(id, log), 0, configJson);
    }

    @Test
    void onErrorExtractionFromConfigJson() {
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN, ConfiguredPlugin.extractOnError(null));
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN, ConfiguredPlugin.extractOnError("{}"));
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN,
                ConfiguredPlugin.extractOnError("{\"rule\":\"x\",\"enabled\":true}"));
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN,
                ConfiguredPlugin.extractOnError("{\"on_error\":\"weird\"}"));
        assertEquals(ConfiguredPlugin.ON_ERROR_CLOSE,
                ConfiguredPlugin.extractOnError("{\"on_error\":\"close\",\"rule\":\"x\"}"));
        assertEquals(ConfiguredPlugin.ON_ERROR_CLOSE,
                ConfiguredPlugin.extractOnError("{\"on_error\":\"CLOSE\"}"));
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN, ConfiguredPlugin.extractOnError("not-json"));
        // default stays open for a ConfiguredPlugin built without config
        assertEquals(ConfiguredPlugin.ON_ERROR_OPEN, new ConfiguredPlugin(plugin("p", log), 0).onError());
    }

    @Test
    void closePolicySyncThrowShortCircuitsWith503Envelope() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        GatewayPlugin strict = new ConfiguredPlugin(new GatewayPlugin() {
            @Override public String pluginId() { return "strict"; }
            @Override public String pluginName() { return "strict"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                throw new IllegalStateException("boom");
            }
        }, 0, "{\"on_error\":\"close\"}");

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(strict, plugin("after", log)));
        StepVerifier.create(runner.execute(exchange, Mono.fromRunnable(forwarded::incrementAndGet)))
                .verifyComplete();

        assertEquals(List.of(), log, "chain must not continue after an on_error=close failure");
        assertEquals(0, forwarded.get(), "forward must not run after an on_error=close failure");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
        assertTrue(exchange.getResponse().isCommitted(), "503 envelope must commit the response");
        String body = exchange.getResponse().getBodyAsString().block();
        assertNotNull(body);
        assertTrue(body.contains("\"code\":503"), body);
        assertTrue(body.contains("\"success\":false"), body);
        assertTrue(body.contains("\"fail\":true"), body);
        assertTrue(body.contains("\"data\":null"), body);
    }

    @Test
    void closePolicyAsyncErrorShortCircuitsToo() {
        MockServerWebExchange exchange = exchange();

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(
                new ConfiguredPlugin(asyncBoom("strict-async"), 0, "{\"on_error\":\"close\"}")));
        StepVerifier.create(runner.execute(exchange, Mono.empty())).verifyComplete();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    @Test
    void closePolicyAfterContinuationStartedStillPropagates() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        // delegates to the (failing) continuation first, then errors itself —
        // the guard rail wins: never re-run, never re-render, propagate
        GatewayPlugin evil = new ConfiguredPlugin(new GatewayPlugin() {
            @Override public String pluginId() { return "evil-close"; }
            @Override public String pluginName() { return "evil-close"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return chain.execute(ex).then(Mono.error(new IllegalStateException("late failure")));
            }
        }, 0, "{\"on_error\":\"close\"}");

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(evil));
        Mono<Void> failingForward = Mono.fromRunnable(forwarded::incrementAndGet)
                .then(Mono.error(new IllegalStateException("upstream down")));

        StepVerifier.create(runner.execute(exchange, failingForward))
                .verifyError(IllegalStateException.class);
        assertEquals(1, forwarded.get());
        assertFalse(exchange.getResponse().isCommitted(),
                "propagation path must not render the 503 envelope");
    }

    @Test
    void openPolicyKeepsHistoricalFailOpen() {
        MockServerWebExchange exchange = exchange();

        FailSafePluginChainRunner runner = new FailSafePluginChainRunner(List.of(
                new ConfiguredPlugin(asyncBoom("loose"), 0, "{\"on_error\":\"open\"}"),
                plugin("after", log)));
        StepVerifier.create(runner.execute(exchange, Mono.empty())).verifyComplete();

        assertEquals(List.of("after"), log);
        assertNull(exchange.getResponse().getStatusCode(), "open policy must not touch the response");
    }

    // ------------------------------------------------------------------
    // S11-4d: legacy Mono continuation API stays intact (POST observe-only usage)
    // ------------------------------------------------------------------

    /**
     * Anchor: the legacy {@code execute(exchange, Mono)} API (used by the POST
     * observe-only chains) keeps running the continuation exactly once, even for
     * a plugin that mutates the exchange downstream.
     */
    @Test
    void legacyMonoContinuationStillRunsExactlyOnce() {
        MockServerWebExchange exchange = exchange();
        AtomicInteger forwarded = new AtomicInteger();

        GatewayPlugin mutator = new GatewayPlugin() {
            @Override public String pluginId() { return "mutator"; }
            @Override public String pluginName() { return "mutator"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                return chain.execute(ex.mutate().response(
                        new org.springframework.http.server.reactive.ServerHttpResponseDecorator(ex.getResponse()) {}
                ).build());
            }
        };

        StepVerifier.create(new FailSafePluginChainRunner(List.of(mutator))
                        .execute(exchange, Mono.fromRunnable(forwarded::incrementAndGet)))
                .verifyComplete();

        assertEquals(1, forwarded.get(), "legacy continuation must run exactly once");
    }

    // ------------------------------------------------------------------
    // S11-4d: executeFn — the continuation receives the chain's final exchange
    // ------------------------------------------------------------------

    /** Mutates the exchange (response decorator) and hands it to the chain. */
    private GatewayPlugin mutator(String id, List<String> log) {
        return new GatewayPlugin() {
            @Override public String pluginId() { return id; }
            @Override public String pluginName() { return id; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                log.add(id);
                return chain.execute(ex.mutate().response(
                        new org.springframework.http.server.reactive.ServerHttpResponseDecorator(ex.getResponse()) {}
                ).build());
            }
        };
    }

    @Test
    void executeFnHandsFinalExchangeToTheContinuation() {
        MockServerWebExchange exchange = exchange();
        AtomicReference<ServerWebExchange> continuationSaw = new AtomicReference<>();

        StepVerifier.create(new FailSafePluginChainRunner(List.of(mutator("m1", log)))
                        .executeFn(exchange, ex -> {
                            continuationSaw.set(ex);
                            return Mono.empty();
                        }))
                .verifyComplete();

        assertNotNull(continuationSaw.get(), "continuation must run at the chain boundary");
        assertInstanceOf(org.springframework.http.server.reactive.ServerHttpResponseDecorator.class,
                continuationSaw.get().getResponse(),
                "continuation must receive the plugin-mutated exchange, not the original");
    }

    @Test
    void executeFnPropagatesMutatedExchangeAcrossPlugins() {
        MockServerWebExchange exchange = exchange();
        AtomicReference<ServerWebExchange> plugin2Saw = new AtomicReference<>();
        AtomicReference<ServerWebExchange> continuationSaw = new AtomicReference<>();

        GatewayPlugin passthrough = new GatewayPlugin() {
            @Override public String pluginId() { return "p2"; }
            @Override public String pluginName() { return "p2"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                plugin2Saw.set(ex);
                return chain.execute(ex);
            }
        };

        StepVerifier.create(new FailSafePluginChainRunner(List.of(mutator("m1", log), passthrough))
                        .executeFn(exchange, ex -> {
                            continuationSaw.set(ex);
                            return Mono.empty();
                        }))
                .verifyComplete();

        assertEquals(List.of("m1"), log);
        assertSame(plugin2Saw.get(), continuationSaw.get(),
                "plugin 2 and the continuation must see the very same mutated exchange");
    }

    @Test
    void mutatedExchangeSurvivesFailOpenContinue() {
        // m1 mutates → boom-async explodes → fail-open continues with the exchange
        // boom-async received (the mutated one) → continuation still sees the decorator
        MockServerWebExchange exchange = exchange();
        AtomicReference<ServerWebExchange> continuationSaw = new AtomicReference<>();

        StepVerifier.create(new FailSafePluginChainRunner(List.of(
                        mutator("m1", log), asyncBoom("boom-async")))
                        .executeFn(exchange, ex -> {
                            continuationSaw.set(ex);
                            return Mono.empty();
                        }))
                .verifyComplete();

        assertEquals(List.of("m1"), log);
        assertInstanceOf(org.springframework.http.server.reactive.ServerHttpResponseDecorator.class,
                continuationSaw.get().getResponse(),
                "fail-open continue must preserve the mutated exchange for the continuation");
    }
}
