package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DynamicRouteLocatorTest {

    private List<Route> routes = new ArrayList<>();

    private List<org.springframework.cloud.gateway.route.Route> load() {
        return Flux.from(new DynamicRouteLocator(() -> routes).getRoutes()).collectList().block();
    }

    private Route backend(Long id, String path, String upstream, String status, int sortOrder) {
        return Route.builder().id(id).routeName("r" + id).routeType("BACKEND")
                .path(path).upstreamUrl(upstream).status(status).sortOrder(sortOrder).build();
    }

    @Test
    void generatesRealPathPredicateForPublishedBackendRoutes() {
        routes.add(backend(1L, "/api/user/**", "http://127.0.0.1:8081", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals("http://127.0.0.1:8081", result.get(0).getUri().toString());

        assertTrue(matches(result.get(0), "/api/user/123"));
        assertTrue(matches(result.get(0), "/api/user/123/orders"));
        assertFalse(matches(result.get(0), "/api/other/123"));
        assertFalse(matches(result.get(0), "/api/userx/123"));
    }

    @Test
    void onlyPublishedRoutesAreRegistered() {
        routes.add(backend(1L, "/api/draft/**", "http://127.0.0.1:1", "DRAFT", 1));
        routes.add(backend(2L, "/api/offline/**", "http://127.0.0.1:2", "OFFLINE", 1));
        routes.add(backend(3L, "/api/pub/**", "http://127.0.0.1:3", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals("3", result.get(0).getId());
    }

    @Test
    void dispatchRoutesGetPlaceholderUriAndSortBeforeBackend() {
        routes.add(backend(1L, "/api/user/**", "http://127.0.0.1:8081", "PUBLISHED", 1));
        routes.add(Route.builder().id(9L).routeName("d").routeType("DISPATCH")
                .path("/api/**").status("PUBLISHED").sortOrder(1).build());

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(2, result.size());
        assertEquals("9", result.get(0).getId());
        assertEquals("dispatch-placeholder.invalid", result.get(0).getUri().getHost());
        assertTrue(result.get(0).getOrder() < result.get(1).getOrder());
        assertTrue(matches(result.get(0), "/api/user/123"));
    }

    @Test
    void invalidPathOrUpstreamAreSkipped() {
        routes.add(backend(1L, null, "http://127.0.0.1:1", "PUBLISHED", 1));
        routes.add(backend(2L, "/api/x/**", null, "PUBLISHED", 1));
        routes.add(backend(3L, "/api/y/**", "not a uri ", "PUBLISHED", 1));
        routes.add(backend(4L, "/ok/**", "http://127.0.0.1:4", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals("4", result.get(0).getId());
    }

    @Test
    void overlappingBackendRoutesFollowSortOrder() {
        routes.add(backend(1L, "/api/**", "http://127.0.0.1:1", "PUBLISHED", 5));
        routes.add(backend(2L, "/api/user/**", "http://127.0.0.1:2", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(2, result.size());
        assertEquals("2", result.get(0).getId());
        assertEquals("1", result.get(1).getId());
    }

    private boolean matches(org.springframework.cloud.gateway.route.Route route, String requestPath) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get(requestPath).build()).build();
        return Mono.from(route.getPredicate().apply(exchange)).block();
    }

    // ===== S12-2：路径语义统一（缺陷③ 尾斜杠口径 = SCG 默认）=====

    /**
     * 缺陷③核心锚：注册层尾斜杠口径必须 = SCG 默认
     * （{@code PathRoutePredicateFactory.Config.matchTrailingSlash=true}）→
     * route path {@code /api} 命中 request {@code /api/}。
     */
    @Test
    void trailingSlashRequestMatchesRoutePath() {
        routes.add(backend(1L, "/api", "http://127.0.0.1:8081", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertTrue(matches(result.get(0), "/api"), "无尾斜杠必须命中");
        assertTrue(matches(result.get(0), "/api/"), "带尾斜杠必须命中（SCG matchTrailingSlash=true）");
    }

    /** 缺陷①：注册层变量路由（{@code {segment}}）命中（与分发层同语义）。 */
    @Test
    void variableSegmentRouteMatches() {
        routes.add(backend(1L, "/foo/{seg}", "http://127.0.0.1:8081", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertTrue(matches(result.get(0), "/foo/bar"));
        assertFalse(matches(result.get(0), "/foo/bar/baz"));
    }

    /**
     * 缺陷②：注册顺序确定化——DISPATCH 优先 → sort_order 升序 → id 升序。
     * 同 sort_order 的两条路由必须按 id 升序稳定排列（不依赖上游列表顺序）。
     */
    @Test
    void equalSortOrderRoutesAreOrderedById() {
        routes.add(backend(20L, "/api/b/**", "http://127.0.0.1:2", "PUBLISHED", 1));
        routes.add(backend(10L, "/api/a/**", "http://127.0.0.1:1", "PUBLISHED", 1));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(2, result.size());
        assertEquals("10", result.get(0).getId());
        assertEquals("20", result.get(1).getId());
    }

    /**
     * 三层一致（缺陷③）：SCG 注册层（本文的 path 谓词）与分发层
     * （{@code RoutePathMatcher}）对同一组 (route.path, request.path) 必须同结论。
     */
    @Test
    void registrationLayerAgreesWithDispatchLayer() {
        routes.add(backend(1L, "/foo/{seg}", "http://127.0.0.1:1", "PUBLISHED", 1));
        routes.add(backend(2L, "/api/*", "http://127.0.0.1:2", "PUBLISHED", 2));
        routes.add(backend(3L, "/api/**", "http://127.0.0.1:3", "PUBLISHED", 3));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(3, result.size());
        java.util.Map<Long, Route> byId = new java.util.HashMap<>();
        routes.forEach(r -> byId.put(r.getId(), r));

        List<String> requestPaths = List.of("/foo/bar", "/foo/bar/baz", "/foo/",
                "/api", "/api/", "/api/x", "/api/x/y", "/other");
        for (org.springframework.cloud.gateway.route.Route scgRoute : result) {
            Long id = Long.valueOf(scgRoute.getId());
            RoutePathMatcher matcher = new RoutePathMatcher();
            matcher.addRoute(id, byId.get(id).getPath());
            for (String requestPath : requestPaths) {
                assertEquals(matches(scgRoute, requestPath), matcher.match(requestPath).isPresent(),
                        "注册层与分发层判定不一致：route=" + byId.get(id).getPath()
                                + " request=" + requestPath);
            }
        }
    }
}
