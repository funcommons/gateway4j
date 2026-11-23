package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.route.filter.ScgRouteFilterSupport;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.handler.AsyncPredicate;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.util.pattern.PathPattern;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Converts persisted gw_route rows into SCG {@link org.springframework.cloud.gateway.route.Route}s.
 *
 * <p>Fixes the former "always-match + no status filter" defect (every request
 * hit whichever route sorted first):</p>
 * <ul>
 *   <li>Only {@code status=PUBLISHED} routes are served — DRAFT/OFFLINE rows are
 *       never registered, so offline/publish hot updates work and unmatched paths
 *       reach SCG's 404 handling.</li>
 *   <li>BACKEND routes get a real path predicate from the configured path
 *       (e.g. {@code /api/user/**} → {@link PathPattern}); SCG then proxies to
 *       {@code upstream_url} natively without rewriting the request path.</li>
 *   <li>DISPATCH routes are registered with the same path semantics but a
 *       placeholder upstream — {@code DispatchRoutingFilter} resolves the real
 *       target sub-route per request (HEADER/QUERY/... conditions).</li>
 *   <li>Ordering: DISPATCH routes sort before BACKEND routes (dispatch parents
 *       take precedence), then by configured sort_order.</li>
 *   <li>S12-1: routes may additionally carry **SCG native predicates**
 *       ({@code Host=**.example.com}, {@code Method=GET,POST}, ...). They are
 *       bound by SCG's own {@code RoutePredicateFactory} and AND-combined with
 *       the path predicate — so {@code host AND path} becomes expressible and
 *       the matching semantics are 100% Spring Cloud Gateway's by construction.</li>
 * </ul>
 */
public class DynamicRouteLocator implements RouteLocator {

    private static final Logger log = LoggerFactory.getLogger(DynamicRouteLocator.class);

    public static final String DISPATCH_PLACEHOLDER_URI = "http://dispatch-placeholder.invalid";

    private static final String TYPE_BACKEND = "BACKEND";
    private static final String TYPE_DISPATCH = "DISPATCH";
    private static final String STATUS_PUBLISHED = "PUBLISHED";

    /** DISPATCH routes sort before all BACKEND routes. */
    static final int DISPATCH_ORDER_BASE = -1_000_000;

    private final Supplier<List<Route>> routeSupplier;

    /** Route id → SCG native predicate definitions (S12-1). */
    private final Function<Long, List<String>> predicateLookup;

    /** SCG native predicate binder (S12-1). */
    private final ScgRoutePredicateSupport scgPredicateSupport;

    /** Route id → SCG native filter definitions (S12-7a). */
    private final Function<Long, List<String>> filterLookup;

    /** SCG native filter binder (S12-7a). */
    private final ScgRouteFilterSupport scgFilterSupport;

    public DynamicRouteLocator(Supplier<List<Route>> routeSupplier) {
        this(routeSupplier, routeId -> List.of(), new ScgRoutePredicateSupport());
    }

    public DynamicRouteLocator(Supplier<List<Route>> routeSupplier,
                               Function<Long, List<String>> predicateLookup,
                               ScgRoutePredicateSupport scgPredicateSupport) {
        // S12-7a：老形态构造器保留（无 filter / metadata 装配），行为与 S12-1 完全一致。
        this(routeSupplier, predicateLookup, scgPredicateSupport,
                routeId -> List.of(), new ScgRouteFilterSupport());
    }

    /**
     * S12-7a 起新增 {@code filterLookup} / {@code scgFilterSupport}：路由级 SCG 原生
     * filter 行（gw_route_filter）按 route_id 取定义串并由 SCG 自己的
     * {@code GatewayFilterFactory} 绑定后挂到 {@code Route.gatewayFilters}。
     */
    public DynamicRouteLocator(Supplier<List<Route>> routeSupplier,
                               Function<Long, List<String>> predicateLookup,
                               ScgRoutePredicateSupport scgPredicateSupport,
                               Function<Long, List<String>> filterLookup,
                               ScgRouteFilterSupport scgFilterSupport) {
        this.routeSupplier = routeSupplier;
        this.predicateLookup = predicateLookup == null ? routeId -> List.of() : predicateLookup;
        this.scgPredicateSupport = scgPredicateSupport == null ? new ScgRoutePredicateSupport() : scgPredicateSupport;
        this.filterLookup = filterLookup == null ? routeId -> List.of() : filterLookup;
        this.scgFilterSupport = scgFilterSupport == null ? new ScgRouteFilterSupport() : scgFilterSupport;
    }

    @Override
    public Flux<org.springframework.cloud.gateway.route.Route> getRoutes() {
        List<Route> routes = routeSupplier.get();
        if (routes == null || routes.isEmpty()) {
            return Flux.empty();
        }

        // S12-2（缺陷②）：注册顺序确定化 —— DISPATCH 优先（order=-1_000_000+sort_order）
        // → sort_order 升序 → id 升序。上游 supplier 的顺序不稳定（DB 无序返回 / 缓存是
        // 哈希 Map），不显式排序时同 order 的路由谁先命中会随部署漂移。
        List<Route> orderedRoutes = routes.stream()
                .sorted(Comparator.comparingInt(DynamicRouteLocator::routeOrder)
                        .thenComparing(DynamicRouteLocator::routeId))
                .toList();

        List<org.springframework.cloud.gateway.route.Route> scgRoutes = new ArrayList<>();
        for (Route route : orderedRoutes) {
            org.springframework.cloud.gateway.route.Route scgRoute = toScgRoute(route);
            if (scgRoute != null) {
                scgRoutes.add(scgRoute);
            }
        }
        // Emission order mirrors getOrder() (DISPATCH → sort_order → id): the
        // RoutePredicateHandlerMapping takes the first matching route, so the
        // emission order is the match order — keep both deterministic and consistent.
        if (log.isDebugEnabled()) {
            log.debug("Dynamic routes registered: {}", scgRoutes.size());
        }
        return Flux.fromIterable(scgRoutes);
    }

    /** 与 SCG route order 同口径：DISPATCH 恒在 BACKEND 之前。 */
    private static int routeOrder(Route route) {
        int sortOrder = route.getSortOrder() != null ? route.getSortOrder() : 0;
        return TYPE_DISPATCH.equals(route.getRouteType()) ? DISPATCH_ORDER_BASE + sortOrder : sortOrder;
    }

    /** id 升序兜底（sort_order 相同时的确定性 tiebreak）。 */
    private static Long routeId(Route route) {
        return route.getId() != null ? route.getId() : Long.MAX_VALUE;
    }

    private org.springframework.cloud.gateway.route.Route toScgRoute(Route route) {
        if (!STATUS_PUBLISHED.equals(route.getStatus())) {
            return null;
        }
        if (route.getPath() == null || route.getPath().isBlank()) {
            return null;
        }

        PathPattern pattern;
        try {
            // S12-2（缺陷③）：path 语义与 SCG 同源 —— 与分发层 / 模拟器共用
            // RoutePathMatcher 的解析器（matchTrailingSlash=true，SCG 默认口径）。
            pattern = RoutePathMatcher.parsePattern(route.getPath());
        } catch (Exception e) {
            log.warn("Skip route {} ({}): invalid path pattern '{}': {}",
                    route.getId(), route.getRouteName(), route.getPath(), e.getMessage());
            return null;
        }

        int sortOrder = route.getSortOrder() != null ? route.getSortOrder() : 0;

        // S12-1: path predicate ∧ route-level SCG native predicates (all AND).
        AsyncPredicate<ServerWebExchange> predicate = pathPredicate(pattern);
        for (AsyncPredicate<ServerWebExchange> scgPredicate : scgPredicates(route)) {
            predicate = predicate.and(scgPredicate);
        }

        org.springframework.cloud.gateway.route.Route.AsyncBuilder builder =
                org.springframework.cloud.gateway.route.Route.async()
                        .id(String.valueOf(route.getId()))
                        .asyncPredicate(predicate);

        // S12-7a: SCG native filters（复刻 RouteDefinitionRouteLocator：定义串 →
        // GatewayFilterFactory.apply → OrderedGatewayFilter(i+1) 包裹）。非法定义在
        // ScgRouteFilterSupport 内分流：未知名跳过（fail-open），已知名坏参恒不放行。
        List<GatewayFilter> scgFilters = scgFilters(route);
        if (!scgFilters.isEmpty()) {
            builder.filters(scgFilters);
        }
        // S12-7a: metadata 透传（gw_route.metadata JSONB → Route.metadata，
        // SCG RouteLocator.matchMetadata 的消费形态）。空/坏 JSON 均为空 map（fail-open）。
        Map<String, Object> metadata = metadataOf(route);
        if (!metadata.isEmpty()) {
            builder.metadata(metadata);
        }

        if (TYPE_DISPATCH.equals(route.getRouteType())) {
            // Placeholder upstream; DispatchRoutingFilter replaces the request URL
            // per request after resolving the target sub-route.
            return builder.uri(URI.create(DISPATCH_PLACEHOLDER_URI))
                    .order(DISPATCH_ORDER_BASE + sortOrder)
                    .build();
        }
        if (TYPE_BACKEND.equals(route.getRouteType())) {
            if (route.getUpstreamUrl() == null || route.getUpstreamUrl().isBlank()) {
                return null;
            }
            URI upstream;
            try {
                upstream = URI.create(route.getUpstreamUrl().trim());
            } catch (IllegalArgumentException e) {
                log.warn("Skip route {} ({}): invalid upstream '{}'",
                        route.getId(), route.getRouteName(), route.getUpstreamUrl());
                return null;
            }
            return builder.uri(upstream)
                    .order(sortOrder)
                    .build();
        }
        return null;
    }

    private AsyncPredicate<org.springframework.web.server.ServerWebExchange> pathPredicate(PathPattern pattern) {
        return exchange -> Mono.just(pattern.matches(
                exchange.getRequest().getPath().pathWithinApplication()));
    }

    /**
     * S12-1: 该路由携带的 SCG 原生谓词（定义串 → SCG 谓词）。
     * 非法定义串在 {@link ScgRoutePredicateSupport} 内被跳过（fail-open），
     * 其余谓词照常生效。
     */
    private List<AsyncPredicate<ServerWebExchange>> scgPredicates(Route route) {
        List<String> definitions = predicateLookup.apply(route.getId());
        if (definitions == null || definitions.isEmpty()) {
            return List.of();
        }
        return scgPredicateSupport.buildPredicates(definitions);
    }

    /**
     * S12-7a: 该路由携带的 SCG 原生 filter（定义串 → SCG GatewayFilter，
     * 挂载顺序 = gw_route_filter.sort_order，即 SCG filters[] 声明顺序）。
     * 未知名/语法坏的定义串在 {@link ScgRouteFilterSupport} 内被跳过（fail-open）；
     * 已知名但缺参/值非法 → 恒不放行 filter（503，永不转发下游）。
     */
    private List<GatewayFilter> scgFilters(Route route) {
        List<String> definitions = filterLookup.apply(route.getId());
        if (definitions == null || definitions.isEmpty()) {
            return List.of();
        }
        return scgFilterSupport.buildFilters(definitions, String.valueOf(route.getId()));
    }

    /**
     * S12-7a: gw_route.metadata（JSONB 字符串）→ SCG Route.metadata 的
     * {@code Map<String,Object>}。坏 JSON / 非 object JSON → 空 map + WARN
     * （fail-open：metadata 是被动数据，解析失败只丢 metadata，不影响路由服务）。
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> metadataOf(Route route) {
        String json = route.getMetadata();
        if (json == null || json.isBlank() || "{}".equals(json.trim())) {
            return Map.of();
        }
        try {
            Map<String, Object> metadata = JsonUtils.mapper().readValue(json, Map.class);
            return metadata == null ? Map.of() : metadata;
        } catch (Exception e) {
            log.warn("Route {} ({}): invalid metadata JSON ignored: {}",
                    route.getId(), route.getRouteName(), e.getMessage());
            return Map.of();
        }
    }
}
