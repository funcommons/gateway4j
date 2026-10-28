package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.util.RoutePathUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.handler.AsyncPredicate;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
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
 * </ul>
 */
public class DynamicRouteLocator implements RouteLocator {

    private static final Logger log = LoggerFactory.getLogger(DynamicRouteLocator.class);

    private static final PathPatternParser PATH_PATTERN_PARSER = PathPatternParser.defaultInstance;

    public static final String DISPATCH_PLACEHOLDER_URI = "http://dispatch-placeholder.invalid";

    private static final String TYPE_BACKEND = "BACKEND";
    private static final String TYPE_DISPATCH = "DISPATCH";
    private static final String STATUS_PUBLISHED = "PUBLISHED";

    /** DISPATCH routes sort before all BACKEND routes. */
    static final int DISPATCH_ORDER_BASE = -1_000_000;

    private final Supplier<List<Route>> routeSupplier;

    public DynamicRouteLocator(Supplier<List<Route>> routeSupplier) {
        this.routeSupplier = routeSupplier;
    }

    @Override
    public Flux<org.springframework.cloud.gateway.route.Route> getRoutes() {
        List<Route> routes = routeSupplier.get();
        if (routes == null || routes.isEmpty()) {
            return Flux.empty();
        }

        List<org.springframework.cloud.gateway.route.Route> scgRoutes = new ArrayList<>();
        for (Route route : routes) {
            org.springframework.cloud.gateway.route.Route scgRoute = toScgRoute(route);
            if (scgRoute != null) {
                scgRoutes.add(scgRoute);
            }
        }
        // Emission order mirrors getOrder(): RoutePredicateHandlerMapping takes the
        // first matching route, so make both deterministic and consistent.
        scgRoutes.sort(Comparator.comparingInt(org.springframework.cloud.gateway.route.Route::getOrder));
        if (log.isDebugEnabled()) {
            log.debug("Dynamic routes registered: {}", scgRoutes.size());
        }
        return Flux.fromIterable(scgRoutes);
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
            pattern = PATH_PATTERN_PARSER.parse(RoutePathUtils.normalizePath(route.getPath()));
        } catch (Exception e) {
            log.warn("Skip route {} ({}): invalid path pattern '{}': {}",
                    route.getId(), route.getRouteName(), route.getPath(), e.getMessage());
            return null;
        }

        int sortOrder = route.getSortOrder() != null ? route.getSortOrder() : 0;

        org.springframework.cloud.gateway.route.Route.AsyncBuilder builder =
                org.springframework.cloud.gateway.route.Route.async()
                        .id(String.valueOf(route.getId()))
                        .asyncPredicate(pathPredicate(pattern));

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
}
