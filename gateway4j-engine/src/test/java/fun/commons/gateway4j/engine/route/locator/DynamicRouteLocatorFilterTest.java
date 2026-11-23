package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.route.filter.ScgRouteFilterSupport;
import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-7a：路由注册层的 SCG 原生 filters 挂载 + metadata 透传。
 *
 * <p>钉住的锚：①带 filter 的路由把 SCG GatewayFilter 挂到 Route 上（真实作用）；
 * ②metadata 落库 JSON 透传给 Route.metadata（SCG {@code RouteLocator.matchMetadata}
 * 消费形态）；③零 filter 零 metadata 时行为与改动前完全一致（回归锚）；
 * ④非法 filter 定义 → 跳过且路由照常服务。</p>
 */
class DynamicRouteLocatorFilterTest {

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
    // 1) 路由带 filter → SCG Route 上挂了该 filter 且真实作用
    // ------------------------------------------------------------------
    @Test
    void routeFiltersAreAttachedToScgRouteAndActuallyWork() {
        routes.add(backend(1L, "/api/**"));
        filters.put(1L, List.of("AddRequestHeader=X-Foo, bar"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).getFilters().size());

        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        result.get(0).getFilters().get(0)
                .filter(exchange(MockServerHttpRequest.get("/api/user")), passThrough(forwarded::set)).block();
        assertEquals("bar", forwarded.get().getRequest().getHeaders().getFirst("X-Foo"));
    }

    // ------------------------------------------------------------------
    // 2) metadata 透传：落库 JSON → Route.getMetadata() 的 Map（SCG matchMetadata 形态）
    // ------------------------------------------------------------------
    @Test
    void metadataIsTransferredToScgRoute() {
        routes.add(backend(1L, "/api/**").toBuilder()
                .metadata("{\"team\":\"core\",\"depth\":2}").build());

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        Map<String, Object> metadata = result.get(0).getMetadata();
        assertEquals("core", metadata.get("team"));
        assertEquals(2, metadata.get("depth"));
    }

    // ------------------------------------------------------------------
    // 3) 零 filter 零 metadata 锚：行为与改动前完全一致
    // ------------------------------------------------------------------
    @Test
    void zeroFiltersAndZeroMetadataBehavesExactlyAsBefore() {
        routes.add(backend(1L, "/api/**"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(result.get(0).getFilters().isEmpty());
        assertTrue(result.get(0).getMetadata().isEmpty());
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
        assertFalse(matches(result.get(0), MockServerHttpRequest.get("/other")));
    }

    // ------------------------------------------------------------------
    // 4) 非法 filter 定义（未知名）→ 跳过该 filter，路由照常服务
    // ------------------------------------------------------------------
    @Test
    void invalidFilterDefinitionIsSkippedAndRouteStillServes() {
        routes.add(backend(1L, "/api/**"));
        filters.put(1L, List.of("Foo=bar"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(result.get(0).getFilters().isEmpty());
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    // ------------------------------------------------------------------
    // 5) 已知 filter 缺必填参数 → 恒不放行 filter（503、永不转发下游）
    //    （对齐 SCG「绑定校验失败 → 路由加载失败 → 永不服务」）
    // ------------------------------------------------------------------
    @Test
    void invalidKnownFilterYieldsDenyFilterOnTheRoute() {
        routes.add(backend(1L, "/api/**"));
        filters.put(1L, List.of("AddRequestHeader=X-Only-Name"));

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).getFilters().size());

        AtomicBoolean forwarded = new AtomicBoolean(false);
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/api/user"));
        result.get(0).getFilters().get(0).filter(exchange,
                passThrough(ex -> forwarded.set(true))).block();
        assertFalse(forwarded.get());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    // ------------------------------------------------------------------
    // 6) metadata 坏 JSON → fail-open（空 metadata），路由照常服务
    // ------------------------------------------------------------------
    @Test
    void invalidMetadataFailsOpenWithEmptyMetadata() {
        routes.add(backend(1L, "/api/**").toBuilder().metadata("{not json").build());

        List<org.springframework.cloud.gateway.route.Route> result = load();
        assertEquals(1, result.size());

        assertTrue(result.get(0).getMetadata().isEmpty());
        assertTrue(matches(result.get(0), MockServerHttpRequest.get("/api/user")));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static GatewayFilterChain passThrough(
            java.util.function.Consumer<ServerWebExchange> consumer) {
        return exchange -> {
            consumer.accept(exchange);
            return Mono.empty();
        };
    }

    private static MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
        return MockServerWebExchange.builder(request.build()).build();
    }

    private boolean matches(org.springframework.cloud.gateway.route.Route route,
                            MockServerHttpRequest.BaseBuilder<?> request) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(request.build()).build();
        return Boolean.TRUE.equals(Mono.from(route.getPredicate().apply(exchange)).block());
    }
}
