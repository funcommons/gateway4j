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

    // ===== S12-2 缺陷②：path 匹配仲裁确定化（DISPATCH 父路由必胜）=====

    private Route dispatchParent() {
        return Route.builder().id(1L).routeType("DISPATCH")
                .routeName("api-dispatch").path("/api/**").build();
    }

    private Route legacyBackend() {
        return Route.builder().id(2L).routeType("BACKEND")
                .routeName("legacy").path("/api/user/**").upstreamUrl("http://legacy:8080").build();
    }

    private Route v2Backend() {
        return Route.builder().id(3L).routeType("BACKEND")
                .routeName("v2").path("/api/user/v2/**").upstreamUrl("http://v2:8080").build();
    }

    private RouteCondition versionCondition() {
        return RouteCondition.builder().routeId(1L).targetRouteId(3L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v2").priority(0).build();
    }

    /**
     * 缺陷②核心锚：DISPATCH 父路由（{@code /api/**}）与后置 BACKEND（{@code /api/user/**}）
     * 前缀重叠时，DISPATCH 必胜——否则父路由的条件（及 S12-1 的 host 谓词）被整段跳过，
     * 请求直接落到后置路由。
     */
    @Test
    void dispatchParentWinsOverOverlappingBackendRoute() {
        // 故意先注册 BACKEND：模拟 DB 无序返回时最坏情况（旧的"先注册者胜"规则会让
        // 后置路由抢走入口）
        dispatcher.updateRoutes(List.of(legacyBackend(), v2Backend(), dispatchParent()),
                List.of(versionCondition()));

        MockServerWebExchange exchange = exchangeWithHeaders("/api/user/1", "X-Version", "v2");
        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> {
                    assertEquals(3L, resolved.routeId(), "DISPATCH 父路由必须先求值条件再落到目标路由");
                    assertEquals(List.of(1L, 3L), resolved.dispatchPath());
                })
                .verifyComplete();
    }

    /** 缺陷②：同一组路由、不同注册顺序 → 同一 winner（仲裁不依赖 DB 返回顺序）。 */
    @Test
    void dispatchWinnerIsIndependentOfRegistrationOrder() {
        List<Route> forward = List.of(dispatchParent(), legacyBackend(), v2Backend());
        List<Route> reversed = List.of(v2Backend(), legacyBackend(), dispatchParent());

        dispatcher.updateRoutes(forward, List.of(versionCondition()));
        MockServerWebExchange first = exchangeWithHeaders("/api/user/1", "X-Version", "v2");
        java.util.List<Long> firstPath = dispatcher.dispatch(first).map(r -> r.dispatchPath()).block();

        dispatcher.updateRoutes(reversed, List.of(versionCondition()));
        MockServerWebExchange second = exchangeWithHeaders("/api/user/1", "X-Version", "v2");
        java.util.List<Long> secondPath = dispatcher.dispatch(second).map(r -> r.dispatchPath()).block();

        assertEquals(List.of(1L, 3L), firstPath);
        assertEquals(firstPath, secondPath, "注册顺序打乱后 winner 必须一致");
    }

    /** 缺陷①：变量路由在分发层可命中（此前静默 404）。 */
    @Test
    void variableSegmentRouteResolves() {
        Route backend = Route.builder().id(1L).routeType("BACKEND")
                .path("/foo/{seg}").upstreamUrl("http://svc:8080").build();
        dispatcher.updateRoutes(List.of(backend), List.of());

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/foo/bar").build()).build();
        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> assertEquals(1L, resolved.routeId()))
                .verifyComplete();
    }

    /** 缺陷③：尾斜杠口径 = SCG 默认（pattern {@code /api} 命中 request {@code /api/}）。 */
    @Test
    void trailingSlashRequestMatchesRoutePath() {
        Route backend = Route.builder().id(1L).routeType("BACKEND")
                .path("/api").upstreamUrl("http://svc:8080").build();
        dispatcher.updateRoutes(List.of(backend), List.of());

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/").build()).build();
        StepVerifier.create(dispatcher.dispatch(exchange))
                .assertNext(resolved -> assertEquals(1L, resolved.routeId()))
                .verifyComplete();
    }
}
