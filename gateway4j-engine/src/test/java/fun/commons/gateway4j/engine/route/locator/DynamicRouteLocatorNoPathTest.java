package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.route.filter.ScgRouteFilterSupport;
import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-7b2：无 Path= 路由（path=null/blank）改由纯 SCG 谓词注册。
 *
 * <p>背景：S12-7b 的 batch API（POST /v1/routes/batch）按 SCG 原生语义允许
 * 「无 Path= 谓词」的路由（path 落 null，SCG 语义 = 路由不限路径），但引擎
 * {@code toScgRoute} 对 path=null/blank 直接 return null → 用户建了路由但静默不生效。</p>
 *
 * <p>钉住的锚：①path=null 且有有效 SCG 谓词 → 正常注册，谓词=纯 SCG 谓词 AND 组合
 * （真实按谓词匹配，命中/不命中双断言）；②blank path 与 null 同口径；
 * ③path=null 且无任何有效 SCG 谓词（无行，或行全部绑定失败）→ 仍不注册
 * （裸路由会匹配一切请求，产品语义不成立）；④有 path + SCG 谓词 → 行为与改动前
 * 完全一致（回归锚）；⑤path=null + filters → filter 照常挂载且真实生效。</p>
 */
class DynamicRouteLocatorNoPathTest {

    private final List<Route> routes = new ArrayList<>();
    private final Map<Long, List<String>> predicates = new HashMap<>();
    private final Map<Long, List<String>> filters = new HashMap<>();

    private List<org.springframework.cloud.gateway.route.Route> load() {
        DynamicRouteLocator locator = new DynamicRouteLocator(() -> routes,
                predicates::get, new ScgRoutePredicateSupport(),
                filters::get, new ScgRouteFilterSupport());
        return Flux.from(locator.getRoutes()).collectList().block();
    }

    private Route backend(Long id, String path) {
        return Route.builder().id(id).routeName("r" + id).routeType("BACKEND")
                .path(path).upstreamUrl("http://127.0.0.1:8081").status("PUBLISHED").sortOrder(1).build();
    }

    // ------------------------------------------------------------------
    // 1) 无 path + Host= 谓词 → 注册且真实按 Host 匹配（命中/不命中两断言）
    // ------------------------------------------------------------------
    @Test
    void noPathWithHostPredicateRegistersAndMatchesByHost() {
        routes.add(backend(1L, null));
        predicates.put(1L, List.of("Host=**.example.com"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        // Host 命中 → 任意路径都命中（路由不限路径，SCG 语义）
        assertTrue(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "api.example.com")));
        // Host 不命中 → 不命中
        assertFalse(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "example.org")));
    }

    // ------------------------------------------------------------------
    // 2) blank path 与 null 同口径
    // ------------------------------------------------------------------
    @Test
    void blankPathWithHostPredicateRegistersLikeNull() {
        routes.add(backend(1L, "  "));
        predicates.put(1L, List.of("Host=**.example.com"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "api.example.com")));
        assertFalse(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "example.org")));
    }

    // ------------------------------------------------------------------
    // 3) 无 path 且无任何 SCG 谓词 → 仍不注册（裸路由匹配一切的坑不放开）
    // ------------------------------------------------------------------
    @Test
    void noPathNoPredicateIsNotRegistered() {
        routes.add(backend(1L, null));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertTrue(result.isEmpty());
    }

    // ------------------------------------------------------------------
    // 3b) 无 path 且定义行存在但全部绑定失败（未知谓词名 fail-open 跳过）
    //     → 有效谓词为空 → 同样不注册（否则退化成裸路由匹配一切）
    // ------------------------------------------------------------------
    @Test
    void noPathWithOnlyInvalidPredicatesIsNotRegistered() {
        routes.add(backend(1L, null));
        predicates.put(1L, List.of("Foo=bar"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertTrue(result.isEmpty());
    }

    // ------------------------------------------------------------------
    // 4) 有 path + SCG 谓词 → 行为与改动前完全一致（回归锚）
    // ------------------------------------------------------------------
    @Test
    void pathWithScgPredicateBehavesExactlyAsBefore() {
        routes.add(backend(1L, "/api/**"));
        predicates.put(1L, List.of("Host=**.example.com"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        // path ∧ host 双命中 → 命中
        assertTrue(matches(result.get(0),
                MockServerHttpRequest.get("/api/user").header(HttpHeaders.HOST, "api.example.com")));
        // host 不命中 → 不命中
        assertFalse(matches(result.get(0),
                MockServerHttpRequest.get("/api/user").header(HttpHeaders.HOST, "example.org")));
        // path 不命中 → 不命中
        assertFalse(matches(result.get(0),
                MockServerHttpRequest.get("/other").header(HttpHeaders.HOST, "api.example.com")));
    }

    // ------------------------------------------------------------------
    // 5) 无 path + filters → 路由注册，filter 照常挂载且真实生效
    // ------------------------------------------------------------------
    @Test
    void noPathWithPredicatesAndFiltersRegistersAndFilterWorks() {
        routes.add(backend(1L, null));
        predicates.put(1L, List.of("Host=**.example.com"));
        filters.put(1L, List.of("AddRequestHeader=X-Foo, bar"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).getFilters().size());

        // filter 真实生效
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        result.get(0).getFilters().get(0).filter(
                exchange(MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "api.example.com")),
                passThrough(forwarded::set)).block();
        assertEquals("bar", forwarded.get().getRequest().getHeaders().getFirst("X-Foo"));

        // 谓词仍按 Host 匹配
        assertTrue(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "api.example.com")));
        assertFalse(matches(result.get(0),
                MockServerHttpRequest.get("/any/path").header(HttpHeaders.HOST, "example.org")));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static GatewayFilterChain passThrough(
            java.util.function.Consumer<ServerWebExchange> consumer) {
        return ex -> {
            consumer.accept(ex);
            return Mono.empty();
        };
    }

    private static MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
        return MockServerWebExchange.builder(request.build()).build();
    }

    private boolean matches(org.springframework.cloud.gateway.route.Route route,
                            MockServerHttpRequest.BaseBuilder<?> request) {
        MockServerWebExchange ex = MockServerWebExchange.builder(request.build()).build();
        return Boolean.TRUE.equals(Mono.from(route.getPredicate().apply(ex)).block());
    }
}
