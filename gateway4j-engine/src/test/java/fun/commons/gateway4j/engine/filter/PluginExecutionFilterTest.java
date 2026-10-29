package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;

import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PluginExecutionFilterTest {

    private List<String> execution;
    private List<Route> routes;
    private List<Plugin> plugins;
    private List<RoutePluginBinding> bindings;
    private PluginInstanceRegistry registry;
    private ConfigService configService;
    private PluginExecutionFilter filter;

    @BeforeEach
    void setUp() {
        execution = new ArrayList<>();
        routes = new ArrayList<>();
        plugins = new ArrayList<>();
        bindings = new ArrayList<>();
        registry = new PluginInstanceRegistry();
        register("gpre", "PRE", "GLOBAL");
        register("gpost", "POST", "GLOBAL");
        register("rpre", "PRE", "ROUTE");
        RouteDispatcher dispatcher = new RouteDispatcher(new RoutePathMatcher(), new RouteConditionMatcher());
        configService = new ConfigService(new RouteConfigCache(), new PluginConfigCache(),
                dispatcher, event -> {}, () -> routes, () -> List.of(), () -> plugins,
                () -> bindings, registry);
        filter = new PluginExecutionFilter(configService, registry);
    }

    private void register(String pluginId, String phase, String scope) {
        registry.register(new GatewayPlugin() {
            @Override public String pluginId() { return pluginId; }
            @Override public String pluginName() { return pluginId; }
            @Override public String phase() { return phase; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                execution.add(pluginId + ":" + phase);
                return chain.execute(exchange);
            }
        });
    }

    private void seed() {
        // global PRE + POST enabled; route-bound PRE plugin for route 7
        plugins.add(Plugin.builder().id(1L).pluginId("gpre").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(5).config("{}").build());
        plugins.add(Plugin.builder().id(2L).pluginId("gpost").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("POST").scope("GLOBAL")
                .status("ENABLED").sortOrder(5).config("{}").build());
        plugins.add(Plugin.builder().id(3L).pluginId("rpre").pluginName("r")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("ROUTE")
                .status("ENABLED").sortOrder(1).config("{}").build());
        bindings.add(RoutePluginBinding.builder().routeId(7L).pluginId(3L).sortOrder(1).build());
        routes.add(Route.builder().id(7L).routeName("r7").routeType("BACKEND")
                .path("/api/**").upstreamUrl("http://127.0.0.1:1").status("PUBLISHED").build());
        configService.loadAllConfig();
    }

    private MockServerWebExchange exchange() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/x").build()).build();
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR,
                org.springframework.cloud.gateway.route.Route.async().id("7").uri(URI.create("http://127.0.0.1:1"))
                        .asyncPredicate(e -> Mono.just(true)).build());
        return exchange;
    }

    @Test
    void preRunsBeforeForwardAndPostAfterForBoundRoute() {
        seed();
        MockServerWebExchange exchange = exchange();
        List<String> order = new ArrayList<>();
        GatewayFilterChain chain = ex -> {
            order.add("forward");
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        assertEquals(List.of("gpre:PRE", "rpre:PRE", "gpost:POST"), execution);
        assertEquals(List.of("forward"), order);
    }

    @Test
    void routePluginsDoNotRunForOtherRoutes() {
        seed();
        MockServerWebExchange exchange = exchange();
        // pretend SCG matched another route id
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR,
                org.springframework.cloud.gateway.route.Route.async().id("99").uri(URI.create("http://127.0.0.1:1"))
                        .asyncPredicate(e -> Mono.just(true)).build());
        GatewayFilterChain chain = ex -> Mono.empty();

        filter.filter(exchange, chain).block();

        assertFalse(execution.contains("rpre:PRE"));
        assertTrue(execution.contains("gpre:PRE"));
    }

    @Test
    void unknownPluginIdIsSkippedNotFatal() {
        register("gpre", "PRE", "GLOBAL");
        plugins.add(Plugin.builder().id(1L).pluginId("gpre").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(1).config("{}").build());
        plugins.add(Plugin.builder().id(2L).pluginId("no-such-plugin").pluginName("x")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(2).config("{}").build());
        configService.loadAllConfig();

        MockServerWebExchange exchange = exchange();
        GatewayFilterChain chain = ex -> Mono.empty();
        filter.filter(exchange, chain).block();

        assertEquals(List.of("gpre:PRE"), execution);
    }

    @Test
    void startTimeAttributeIsSet() {
        seed();
        MockServerWebExchange exchange = exchange();
        GatewayFilterChain chain = ex -> Mono.empty();
        filter.filter(exchange, chain).block();
        assertTrue(exchange.getAttributes().containsKey(GatewayConstants.REQUEST_START_TIME_KEY));
    }

    @Test
    void routePathPatternExposedForMetricTagging() {
        seed();
        MockServerWebExchange exchange = exchange();
        filter.filter(exchange, ex -> Mono.empty()).block();
        // seed() route 7 path=/api/** — exposed for MetricsPlugin per-route tagging
        assertEquals("/api/**", exchange.getAttribute(PluginExecutionFilter.ROUTE_PATH_PATTERN_ATTR));
    }

    @Test
    void postChainStillRunsWhenForwardFails() {
        // Upstream refuses the connection: POST plugins (logging-post etc.) must still execute,
        // and the original forward error must propagate (never a silent swallow, never a re-forward).
        seed();
        MockServerWebExchange exchange = exchange();
        RuntimeException connectRefused = new RuntimeException("Connection refused: /127.0.0.1:1");
        GatewayFilterChain chain = ex -> Mono.error(connectRefused);

        RuntimeException thrown = assertThrows(RuntimeException.class,
                () -> filter.filter(exchange, chain).block());

        assertSame(connectRefused, thrown);
        assertTrue(execution.contains("gpre:PRE"), "PRE chain should have run");
        assertTrue(execution.contains("gpost:POST"),
                "POST chain must run on the forward-failure path (error requests need logging/metrics most)");
        assertEquals("RuntimeException", exchange.getAttribute(PluginExecutionFilter.FORWARD_ERROR_ATTR),
                "POST observers need the forward-error marker to count request errors");
    }

    @Test
    void forwardIsNeverRetriedAndOriginalErrorSurvivesFailingPostPlugin() {
        seed();
        final int[] forwardCalls = {0};
        MockServerWebExchange exchange = exchange();
        RuntimeException connectRefused = new RuntimeException("Connection refused");
        // A POST plugin that itself blows up on the error path must not mask the
        // upstream error nor trigger a second forward.
        registry.register(new GatewayPlugin() {
            @Override public String pluginId() { return "gpost-broken"; }
            @Override public String pluginName() { return pluginId(); }
            @Override public String phase() { return "POST"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                execution.add("gpost-broken:POST");
                return Mono.error(new IllegalStateException("post plugin exploded"));
            }
        });
        plugins.add(Plugin.builder().id(4L).pluginId("gpost-broken").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("POST").scope("GLOBAL")
                .status("ENABLED").sortOrder(6).config("{}").build());
        configService.loadAllConfig();

        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                filter.filter(exchange, ex -> {
                    forwardCalls[0]++;
                    return Mono.error(connectRefused);
                }).block());

        assertSame(connectRefused, thrown,
                "original upstream error must survive a failing POST plugin");
        assertEquals(1, forwardCalls[0], "forward must be attempted exactly once (no replay)");
        assertEquals(List.of("gpre:PRE", "rpre:PRE", "gpost:POST", "gpost-broken:POST"), execution);
    }

    @Test
    void rewriteAttributeRewritesForwardUrlPathOnly() {
        seed();
        MockServerWebExchange exchange = exchange();
        exchange.getAttributes().put(PluginExecutionFilter.REWRITE_URI_ATTR, "/real/x");
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR,
                URI.create("http://127.0.0.1:1/e2e/gw/svc-a/x?y=1"));
        URI forwarded = captureForwardedUrl(exchange);

        assertEquals("http://127.0.0.1:1/real/x?y=1", String.valueOf(forwarded));
    }

    @Test
    void forwardUrlUntouchedWithoutRewriteAttribute() {
        seed();
        MockServerWebExchange exchange = exchange();
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR,
                URI.create("http://127.0.0.1:1/e2e/gw/svc-a/x"));
        URI forwarded = captureForwardedUrl(exchange);

        assertEquals("http://127.0.0.1:1/e2e/gw/svc-a/x", String.valueOf(forwarded));
    }

    /** Runs the filter and returns the forward URL as the (simulated) routing filter sees it. */
    private URI captureForwardedUrl(MockServerWebExchange exchange) {
        java.util.concurrent.atomic.AtomicReference<URI> seen = new java.util.concurrent.atomic.AtomicReference<>();
        filter.filter(exchange, ex -> {
            seen.set(ex.getRequiredAttribute(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR));
            return Mono.empty();
        }).block();
        return seen.get();
    }

    // ------------------------------------------------------------------
    // P1-1: in-flight gauge / P1-2: execution stats
    // ------------------------------------------------------------------

    @Test
    void inFlightCountIncrementsAndDecrementsAroundTheRequest() {
        fun.commons.gateway4j.engine.metrics.InFlightRequestTracker tracker =
                new fun.commons.gateway4j.engine.metrics.InFlightRequestTracker();
        filter = new PluginExecutionFilter(configService, registry, tracker,
                new fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats());
        seed();

        java.util.concurrent.atomic.AtomicLong seenDuringRequest = new java.util.concurrent.atomic.AtomicLong(-1);
        filter.filter(exchange(), ex -> {
            seenDuringRequest.set(tracker.activeFor("/api/**"));
            return Mono.empty();
        }).block();

        assertEquals(1L, seenDuringRequest.get(), "in-flight must be 1 while the request executes");
        assertEquals(0L, tracker.activeFor("/api/**"), "in-flight must drop back to 0 after completion");
    }

    @Test
    void inFlightDecrementsEvenWhenForwardFails() {
        fun.commons.gateway4j.engine.metrics.InFlightRequestTracker tracker =
                new fun.commons.gateway4j.engine.metrics.InFlightRequestTracker();
        filter = new PluginExecutionFilter(configService, registry, tracker, null);
        seed();

        assertThrows(RuntimeException.class, () ->
                filter.filter(exchange(), ex -> Mono.error(new RuntimeException("upstream down"))).block());

        assertEquals(0L, tracker.activeFor("/api/**"), "doFinally must fire on error signals too");
    }

    @Test
    void inFlightWithoutRoutePatternFallsIntoOtherBucket() {
        fun.commons.gateway4j.engine.metrics.InFlightRequestTracker tracker =
                new fun.commons.gateway4j.engine.metrics.InFlightRequestTracker();
        filter = new PluginExecutionFilter(configService, registry, tracker, null);
        // no route attribute → no pattern → "_other"
        MockServerWebExchange noRoute = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/nowhere").build()).build();

        java.util.concurrent.atomic.AtomicLong seenDuringRequest = new java.util.concurrent.atomic.AtomicLong(-1);
        filter.filter(noRoute, ex -> {
            seenDuringRequest.set(tracker.activeFor("_other"));
            return Mono.empty();
        }).block();

        assertEquals(1L, seenDuringRequest.get(), "pattern-less requests are counted under _other");
        assertEquals(0L, tracker.activeFor("_other"), "and released after the request");
    }

    @Test
    void unregisteredPluginRowCountsAsSkippedInStats() {
        fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats stats =
                new fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats();
        filter = new PluginExecutionFilter(configService, registry, null, stats);

        register("gpre", "PRE", "GLOBAL");
        plugins.add(Plugin.builder().id(1L).pluginId("gpre").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(1).config("{}").build());
        // no runtime instance for "ghost" → composition-time skip, counted per request
        plugins.add(Plugin.builder().id(2L).pluginId("ghost").pluginName("ghost-name")
                .pluginType("GROOVY").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(2).config("{}").build());
        configService.loadAllConfig();

        filter.filter(exchange(), ex -> Mono.empty()).block();

        assertArrayEquals(new long[]{0, 1, 0}, stats.statsFor("ghost"));
        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("gpre"));
    }

    @Test
    void onErrorCloseConfigReachesTheChainRunner() {
        // security-style strict config on a throwing plugin: 503 short-circuit, no forward
        registry.register(new GatewayPlugin() {
            @Override public String pluginId() { return "strict"; }
            @Override public String pluginName() { return "strict"; }
            @Override public String phase() { return "PRE"; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(ServerWebExchange ex, PluginChain chain) {
                execution.add("strict:PRE");
                return Mono.error(new IllegalStateException("waf exploded"));
            }
        });
        plugins.add(Plugin.builder().id(9L).pluginId("strict").pluginName("strict")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(1).config("{\"on_error\":\"close\"}").build());
        configService.loadAllConfig();

        MockServerWebExchange exchange = exchange();
        boolean[] chained = {false};
        filter.filter(exchange, ex -> {
            chained[0] = true;
            return Mono.empty();
        }).block();

        assertFalse(chained[0], "on_error=close must short-circuit before the forward");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
        assertTrue(exchange.getResponse().getBodyAsString().block().contains("\"code\":503"));
    }
}
