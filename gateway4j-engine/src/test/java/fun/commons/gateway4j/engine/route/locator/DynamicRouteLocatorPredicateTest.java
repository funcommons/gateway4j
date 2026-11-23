package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-1：路由注册层的 SCG 原生谓词（与既有 Path 谓词 AND 组合）。
 *
 * <p>钉住的锚：①path ∧ host 的 AND 组合（gateway4j 旧自研 matcher 表达不了
 * host AND path）；②零谓词时注册行为与改动前完全一致（回归锚）；③未知谓词名
 * fail-open（跳过该谓词、其余照常）；④已知谓词缺必填参数 → 谓词恒不匹配 →
 * 整条路由不服务（对齐 SCG「路由加载失败 → 不注册」，fail-closed 于路由准入层）。</p>
 */
class DynamicRouteLocatorPredicateTest {

    private final List<Route> routes = new ArrayList<>();
    private final Map<Long, List<String>> predicates = new HashMap<>();

    private List<org.springframework.cloud.gateway.route.Route> load() {
        DynamicRouteLocator locator = new DynamicRouteLocator(() -> routes,
                predicates::get, new ScgRoutePredicateSupport());
        return Flux.from(locator.getRoutes()).collectList().block();
    }

    private Route backend(Long id, String path) {
        return Route.builder().id(id).routeName("r" + id).routeType("BACKEND")
                .path(path).upstreamUrl("http://127.0.0.1:8081").status("PUBLISHED").sortOrder(1).build();
    }

    @Test
    void pathAndHostPredicatesAreAndCombined() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Host=**.example.com"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        // path 命中 + host 命中 → 命中
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user").header(HttpHeaders.HOST, "api.example.com")));
        // path 命中 + host 不命中 → 不命中
        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/api/user").header(HttpHeaders.HOST, "example.org")));
        // path 不命中（host 命中）→ 不命中
        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/other").header(HttpHeaders.HOST, "api.example.com")));
    }

    @Test
    void routeWithoutPredicatesBehavesExactlyAsBefore() {
        routes.add(backend(1L, "/api/**"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user/1")));
        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/other")));
    }

    @Test
    void methodPredicateIsAppliedOnTheRoute() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Method=GET,POST"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
        assertFalse(matches(result.get(0), MockServerHttpRequest.method(HttpMethod.DELETE, "/api/user")));
    }

    @Test
    void invalidDefinitionIsSkippedAndRouteStillServes() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Foo=bar"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        // 未知谓词名 → 跳过该谓词，路由其余行为照常
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    @Test
    void invalidDefinitionDoesNotBreakTheOtherPredicates() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Foo=bar", "Method=GET"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
        assertFalse(matches(result.get(0), MockServerHttpRequest.method(HttpMethod.PUT, "/api/user")));
    }

    // ------------------------------------------------------------------
    // 已知谓词缺必填参数 → 谓词恒不匹配 → 整条路由不服务
    // （对齐 SCG：shortcut 绑定 @NotEmpty 失败 → 路由加载失败 → 不注册）
    // ------------------------------------------------------------------
    @Test
    void missingRequiredArgumentMakesRouteNeverMatch() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Cookie=session"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    @Test
    void emptyMethodListMakesRouteNeverMatch() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Method="));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    @Test
    void missingRequiredArgumentMakesRouteNeverMatchEvenWithOtherPredicates() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Cookie=session", "Method=GET"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        // 其它谓词本身是好的，但 AND 链里有恒不匹配的谓词 → 整条路由不匹配
        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    private boolean matches(org.springframework.cloud.gateway.route.Route route,
                            MockServerHttpRequest.BaseBuilder<?> request) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(request.build()).build();
        return Boolean.TRUE.equals(Mono.from(route.getPredicate().apply(exchange)).block());
    }
}
