package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.locator.DynamicRouteLocator;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;

import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DispatchRoutingFilterTest {

    private RouteDispatcher dispatcher;
    private ConfigService configService;
    private DispatchRoutingFilter filter;
    private List<Route> routes;
    private List<RouteCondition> conditions;

    @BeforeEach
    void setUp() {
        routes = new ArrayList<>();
        conditions = new ArrayList<>();
        dispatcher = new RouteDispatcher(new RoutePathMatcher(), new RouteConditionMatcher());
        configService = new ConfigService(new RouteConfigCache(), new PluginConfigCache(),
                dispatcher, event -> {}, () -> routes, () -> conditions, () -> List.of());
        filter = new DispatchRoutingFilter(configService, dispatcher);
    }

    private void seedDispatchSetup() {
        Route target = Route.builder().id(2L).routeName("sub").routeType("BACKEND")
                .path("/e2e/sub/**").upstreamUrl("http://127.0.0.1:19002")
                .status("PUBLISHED").sortOrder(1).build();
        Route dispatch = Route.builder().id(1L).routeName("disp").routeType("DISPATCH")
                .path("/e2e/dispatch/**").status("PUBLISHED").sortOrder(1).build();
        RouteCondition headerV1 = RouteCondition.builder()
                .routeId(1L).targetRouteId(2L).conditionType("HEADER").operator("EQ")
                .conditionKey("x-ver").conditionValue("v1").priority(1).build();
        routes.add(target);
        routes.add(dispatch);
        conditions.add(headerV1);
        configService.loadAllConfig();
    }

    private MockServerWebExchange exchange(String path, String routeId, String headerVer) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get(path).header("x-ver", headerVer).build()).build();
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR,
                org.springframework.cloud.gateway.route.Route.async().id(routeId).uri(URI.create(DynamicRouteLocator.DISPATCH_PLACEHOLDER_URI))
                        .asyncPredicate(e -> Mono.just(true)).build());
        return exchange;
    }

    private GatewayFilterChain chain(boolean[] chained) {
        return ex -> {
            chained[0] = true;
            return Mono.empty();
        };
    }

    @Test
    void dispatchResolvesTargetAndRewritesRequestUrl() {
        seedDispatchSetup();
        MockServerWebExchange exchange = exchange("/e2e/dispatch/ping?k=v", "1", "v1");
        boolean[] chained = {false};

        filter.filter(exchange, chain(chained)).block();

        assertTrue(chained[0]);
        URI url = exchange.getRequiredAttribute(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR);
        assertEquals("http://127.0.0.1:19002/e2e/dispatch/ping?k=v", url.toString());
        assertEquals(2L, (Long) exchange.getAttribute(GatewayConstants.ROUTE_ID_KEY));
    }

    @Test
    void dispatchWithoutMatchingConditionReturns404() {
        seedDispatchSetup();
        MockServerWebExchange exchange = exchange("/e2e/dispatch/ping", "1", "v2");
        boolean[] chained = {false};

        filter.filter(exchange, chain(chained)).block();

        assertFalse(chained[0], "request must not be forwarded");
        assertEquals(HttpStatus.NOT_FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void dispatch404CarriesJsonEnvelopeAndTraceHeader() {
        seedDispatchSetup();
        MockServerWebExchange exchange = exchange("/e2e/dispatch/ping", "1", "v2");
        boolean[] chained = {false};

        filter.filter(exchange, chain(chained)).block();

        // envelope shape identical to GatewayErrorAdvice (code/message/data/success/fail)
        String body = exchange.getResponse().getBodyAsString().block();
        assertNotNull(body);
        Map<?, ?> json = fun.commons.gateway4j.common.util.JsonUtils.parseObject(body, Map.class);
        assertEquals(404, ((Number) json.get("code")).intValue());
        assertEquals(Boolean.FALSE, json.get("success"));
        assertEquals(Boolean.TRUE, json.get("fail"));
        assertTrue(json.containsKey("data"));
        assertNull(json.get("data"));
        assertNotNull(json.get("message"));
        // contract field order
        assertIterableEquals(List.of("code", "message", "data", "success", "fail"),
                ((java.util.LinkedHashMap<?, ?>) json).keySet());

        // headers: JSON content type + trace id (engine attr if set, else UUID)
        assertEquals("application/json", String.valueOf(
                exchange.getResponse().getHeaders().getContentType()));
        String traceId = exchange.getResponse().getHeaders().getFirst("X-Trace-Id");
        assertNotNull(traceId, "X-Trace-Id header must be present");
        assertFalse(traceId.isBlank());

        // a pre-set engine trace id must be echoed verbatim, not replaced
        MockServerWebExchange withTrace = exchange("/e2e/dispatch/ping", "1", "v2");
        withTrace.getAttributes().put(GatewayConstants.TRACE_ID_KEY, "trace-abc-123");
        filter.filter(withTrace, chain(new boolean[1])).block();
        assertEquals("trace-abc-123",
                withTrace.getResponse().getHeaders().getFirst("X-Trace-Id"));
    }

    @Test
    void dispatchInvalidUpstreamReturns502Envelope() {
        Route brokenTarget = Route.builder().id(3L).routeName("broken").routeType("BACKEND")
                .path("/e2e/broken/**").upstreamUrl("   ")
                .status("PUBLISHED").sortOrder(1).build();
        Route dispatch = Route.builder().id(1L).routeName("disp").routeType("DISPATCH")
                .path("/e2e/dispatch/**").status("PUBLISHED").sortOrder(1).build();
        RouteCondition toBroken = RouteCondition.builder()
                .routeId(1L).targetRouteId(3L).conditionType("HEADER").operator("EQ")
                .conditionKey("x-ver").conditionValue("broken").priority(1).build();
        routes.add(brokenTarget);
        routes.add(dispatch);
        conditions.add(toBroken);
        configService.loadAllConfig();

        MockServerWebExchange exchange = exchange("/e2e/dispatch/x", "1", "broken");
        boolean[] chained = {false};
        filter.filter(exchange, chain(chained)).block();

        assertFalse(chained[0]);
        assertEquals(HttpStatus.BAD_GATEWAY, exchange.getResponse().getStatusCode());
        Map<?, ?> json = fun.commons.gateway4j.common.util.JsonUtils
                .parseObject(exchange.getResponse().getBodyAsString().block(), Map.class);
        assertEquals(502, ((Number) json.get("code")).intValue());
        assertEquals(Boolean.FALSE, json.get("success"));
        assertNotNull(exchange.getResponse().getHeaders().getFirst("X-Trace-Id"));
    }

    @Test
    void backendRoutePassesThroughUntouched() {
        seedDispatchSetup();
        MockServerWebExchange exchange = exchange("/e2e/sub/ping", "2", "v1");
        boolean[] chained = {false};

        filter.filter(exchange, chain(chained)).block();

        assertTrue(chained[0]);
        assertNull(exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR));
    }

    @Test
    void requestWithoutRouteAttributePassesThrough() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/x").build()).build();
        boolean[] chained = {false};

        filter.filter(exchange, chain(chained)).block();

        assertTrue(chained[0]);
    }
}
