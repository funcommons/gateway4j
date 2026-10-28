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
}
