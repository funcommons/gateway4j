package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.web.GatewayErrorResponses;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.filter.RouteToRequestUrlFilter;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;

/**
 * Executes DISPATCH (分发) routes inside the SCG filter chain.
 *
 * <p>DISPATCH routes are registered in {@code DynamicRouteLocator} as SCG routes
 * with a real path predicate and a placeholder upstream URI. When SCG matches a
 * DISPATCH route, this filter (running after {@link RouteToRequestUrlFilter},
 * before the routing filter) resolves the actual target sub-route via
 * {@link RouteDispatcher} (HEADER/QUERY/BODY/GROOVY conditions, nested dispatch,
 * cycle & depth guards) and rewrites {@code GATEWAY_REQUEST_URL_ATTR} to the
 * target upstream. The standard SCG routing filter then performs the forward —
 * request body, headers and query are preserved, the request path is NOT
 * rewritten.</p>
 *
 * <p>If no condition matches any target, the gateway answers 404 itself (the
 * request is never forwarded) using the shared data-plane error envelope + an
 * {@code X-Trace-Id} header ({@link GatewayErrorResponses}, same shape as
 * gateway-boot's GatewayErrorAdvice). Backend (BACKEND) routes are not touched
 * and pass straight through.</p>
 */
public class DispatchRoutingFilter implements GlobalFilter, org.springframework.core.Ordered {

    private static final Logger log = LoggerFactory.getLogger(DispatchRoutingFilter.class);

    /** After RouteToRequestUrlFilter (10000), well before NettyRoutingFilter (Integer.MAX_VALUE). */
    public static final int DISPATCH_FILTER_ORDER = RouteToRequestUrlFilter.ROUTE_TO_URL_FILTER_ORDER + 10;

    private final ConfigService configService;
    private final RouteDispatcher routeDispatcher;

    public DispatchRoutingFilter(ConfigService configService, RouteDispatcher routeDispatcher) {
        this.configService = configService;
        this.routeDispatcher = routeDispatcher;
    }

    @Override
    public int getOrder() {
        return DISPATCH_FILTER_ORDER;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        org.springframework.cloud.gateway.route.Route scgRoute =
                exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        if (scgRoute == null) {
            return chain.filter(exchange);
        }
        Long routeId = parseRouteId(scgRoute.getId());
        if (routeId == null || !configService.isDispatchRoute(routeId)) {
            return chain.filter(exchange);
        }
        log.debug("Dispatch route {} handling request {}", routeId, exchange.getRequest().getPath().value());

        java.util.concurrent.atomic.AtomicBoolean resolved =
                new java.util.concurrent.atomic.AtomicBoolean(false);
        return routeDispatcher.dispatch(exchange)
                .doOnNext(r -> resolved.set(true))
                .flatMap(resolvedRoute -> forward(exchange, resolvedRoute, chain))
                // NOTE: forward()/chain.filter() complete EMPTY (Mono<Void>), so a plain
                // switchIfEmpty would fire after successful forwarding; only 404 when
                // dispatch() itself produced no resolution.
                .switchIfEmpty(Mono.defer(() -> resolved.get()
                        ? Mono.empty()
                        : respond404(exchange, routeId)));
    }

    private Mono<Void> forward(ServerWebExchange exchange,
                               fun.commons.gateway4j.engine.route.dispatcher.ResolvedRoute resolved,
                               GatewayFilterChain chain) {
        URI target = buildTargetUri(exchange.getRequest().getURI(), resolved.upstreamUrl());
        if (target == null) {
            log.warn("Dispatch route resolved to invalid upstream '{}', returning 502", resolved.upstreamUrl());
            return respond(exchange, HttpStatus.BAD_GATEWAY,
                    "Bad Gateway: dispatch route resolved to invalid upstream");
        }
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR, target);
        exchange.getAttributes().put(GatewayConstants.RESOLVED_ROUTE_KEY, resolved);
        exchange.getAttributes().put(GatewayConstants.ROUTE_ID_KEY, resolved.routeId());
        log.debug("Dispatch forwarding route={} path={} to upstream={}",
                resolved.routeId(), resolved.matchedPath(), resolved.upstreamUrl());
        return chain.filter(exchange);
    }

    /** Keeps the original request path/query; swaps scheme://authority to the target upstream. */
    private URI buildTargetUri(URI original, String upstreamUrl) {
        if (upstreamUrl == null || upstreamUrl.isBlank()) {
            return null;
        }
        try {
            URI upstream = URI.create(upstreamUrl.trim());
            return new URI(upstream.getScheme(), upstream.getRawAuthority(),
                    original.getRawPath(), original.getRawQuery(), original.getRawFragment());
        } catch (Exception e) {
            log.warn("Cannot build target URI from upstream '{}': {}", upstreamUrl, e.getMessage());
            return null;
        }
    }

    /**
     * The single info-level log line for the no-target 404 case (the happy-path
     * dispatch logs stay debug — per-request noise). The 404 itself answers with
     * the same JSON envelope + {@code X-Trace-Id} as GatewayErrorAdvice, so the
     * gateway's own answers are indistinguishable in shape from the advice ones.
     */
    private Mono<Void> respond404(ServerWebExchange exchange, Long dispatchRouteId) {
        log.info("Dispatch route {} matched path {} but no condition/target resolved, returning 404",
                dispatchRouteId, exchange.getRequest().getPath().value());
        return respond(exchange, HttpStatus.NOT_FOUND, "Not Found: no dispatch condition/target resolved");
    }

    private Mono<Void> respond(ServerWebExchange exchange, HttpStatus status, String message) {
        if (exchange.getResponse().isCommitted()) {
            // defensive: nothing sensible to render anymore
            return exchange.getResponse().setComplete();
        }
        return GatewayErrorResponses.respond(exchange, status, message);
    }

    private Long parseRouteId(String id) {
        try {
            return Long.valueOf(id);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
