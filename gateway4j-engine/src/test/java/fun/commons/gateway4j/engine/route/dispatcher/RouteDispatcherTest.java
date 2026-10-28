package fun.commons.gateway4j.engine.route.dispatcher;

import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RouteDispatcherTest {

    private RouteDispatcher dispatcher;
    private RoutePathMatcher pathMatcher;
    private RouteConditionMatcher conditionMatcher;

    @BeforeEach
    void setUp() {
        pathMatcher = new RoutePathMatcher();
        conditionMatcher = new RouteConditionMatcher();
        dispatcher = new RouteDispatcher(pathMatcher, conditionMatcher);
    }

    private MockServerWebExchange exchangeWithHeaders(String path, String... headers) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        return MockServerWebExchange.builder(builder.build()).build();
    }

    @Test
    void singleBackendRoute() {
        Route backend = Route.builder().id(1L).routeType("BACKEND")
                .path("/api/users").upstreamUrl("http://users:8080").build();
        dispatcher.updateRoutes(List.of(backend), List.of());

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();

        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> {
                    assertEquals(1L, resolved.routeId());
                    assertEquals("http://users:8080", resolved.upstreamUrl());
                    assertEquals("/api/users", resolved.matchedPath());
                })
                .verifyComplete();
    }

    @Test
    void dispatchToBackend() {
        Route dispatch = Route.builder().id(1L).routeType("DISPATCH")
                .routeName("api-dispatch").path("/api/**").build();
        Route backend = Route.builder().id(2L).routeType("BACKEND")
                .upstreamUrl("http://v2:8080").build();
        RouteCondition cond = RouteCondition.builder()
                .routeId(1L).targetRouteId(2L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v2").priority(0).build();

        dispatcher.updateRoutes(List.of(dispatch, backend), List.of(cond));

        MockServerWebExchange exchange = exchangeWithHeaders("/api/v2/users", "X-Version", "v2");
        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> assertEquals(2L, resolved.routeId()))
                .verifyComplete();
    }

    @Test
    void nestedDispatch() {
        Route d1 = Route.builder().id(1L).routeType("DISPATCH")
                .routeName("root").path("/api/**").build();
        Route d2 = Route.builder().id(2L).routeType("DISPATCH")
                .routeName("region").build();
        Route backend = Route.builder().id(3L).routeType("BACKEND")
                .upstreamUrl("http://cn:8080").build();

        RouteCondition c1 = RouteCondition.builder().routeId(1L).targetRouteId(2L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Region").conditionValue("CN").priority(0).build();
        RouteCondition c2 = RouteCondition.builder().routeId(2L).targetRouteId(3L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Env").conditionValue("prod").priority(0).build();

        dispatcher.updateRoutes(List.of(d1, d2, backend), List.of(c1, c2));

        MockServerWebExchange exchange = exchangeWithHeaders("/api/users", "X-Region", "CN", "X-Env", "prod");

        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> {
                    assertEquals(3L, resolved.routeId());
                    assertEquals(3, resolved.dispatchPath().size());
                })
                .verifyComplete();
    }

    @Test
    void cyclicReferenceThrows() {
        Route d1 = Route.builder().id(1L).routeType("DISPATCH")
                .routeName("a").path("/api/**").build();
        Route d2 = Route.builder().id(2L).routeType("DISPATCH")
                .routeName("b").build();

        RouteCondition c1 = RouteCondition.builder().routeId(1L).targetRouteId(2L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1").priority(0).build();
        RouteCondition c2 = RouteCondition.builder().routeId(2L).targetRouteId(1L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1").priority(0).build();

        dispatcher.updateRoutes(List.of(d1, d2), List.of(c1, c2));

        MockServerWebExchange exchange = exchangeWithHeaders("/api/test", "X-Test", "1");
        StepVerifier.create(dispatcher.dispatch(exchange))
                .expectError(CyclicReferenceException.class)
                .verify();
    }

    @Test
    void depthExceededThrows() {
        List<Route> routes = new java.util.ArrayList<>();
        List<RouteCondition> conditions = new java.util.ArrayList<>();

        routes.add(Route.builder().id(1L).routeType("DISPATCH")
                .routeName("d1").path("/api/**").build());
        for (int i = 2; i <= 7; i++) {
            routes.add(Route.builder().id((long) i).routeType("DISPATCH")
                    .routeName("d" + i).build());
            conditions.add(RouteCondition.builder()
                    .routeId((long) (i - 1)).targetRouteId((long) i)
                    .conditionType("HEADER").operator("EQ")
                    .conditionKey("X-Depth").conditionValue("deep").priority(0).build());
        }

        dispatcher.updateRoutes(routes, conditions);

        MockServerWebExchange exchange = exchangeWithHeaders("/api/test", "X-Depth", "deep");
        StepVerifier.create(dispatcher.dispatch(exchange))
                .expectError(DepthExceededException.class)
                .verify();
    }

    @Test
    void noMatchingRouteReturnsEmpty() {
        Route backend = Route.builder().id(1L).routeType("BACKEND")
                .path("/api/users").upstreamUrl("http://users:8080").build();
        dispatcher.updateRoutes(List.of(backend), List.of());

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/orders").build()).build();

        StepVerifier.create(dispatcher.dispatch(exchange))
                .verifyComplete();
    }
}
