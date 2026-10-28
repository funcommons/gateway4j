package fun.commons.gateway4j.engine.route.dispatcher;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

public class RouteDispatcher {

    private static final Logger log = LoggerFactory.getLogger(RouteDispatcher.class);

    private final RoutePathMatcher pathMatcher;
    private final RouteConditionMatcher conditionMatcher;
    private Map<Long, Route> routeMap = Map.of();
    private Map<Long, List<RouteCondition>> conditionMap = Map.of();

    public RouteDispatcher(RoutePathMatcher pathMatcher, RouteConditionMatcher conditionMatcher) {
        this.pathMatcher = pathMatcher;
        this.conditionMatcher = conditionMatcher;
    }

    public void updateRoutes(List<Route> routes, List<RouteCondition> conditions) {
        this.routeMap = routes.stream()
                .filter(r -> "BACKEND".equals(r.getRouteType()))
                .collect(Collectors.toMap(Route::getId, Function.identity()));

        Map<Long, Route> dispatchRoutes = routes.stream()
                .filter(r -> "DISPATCH".equals(r.getRouteType()))
                .collect(Collectors.toMap(Route::getId, Function.identity()));

        this.routeMap = new HashMap<>(this.routeMap);
        dispatchRoutes.forEach(this.routeMap::put);

        this.conditionMap = conditions.stream()
                .collect(Collectors.groupingBy(RouteCondition::getRouteId));

        pathMatcher.clear();
        for (Route route : routes) {
            if (route.getPath() != null) {
                pathMatcher.addRoute(route.getId(), route.getPath());
            }
        }
    }

    public Mono<ResolvedRoute> dispatch(ServerWebExchange exchange) {
        String requestPath = exchange.getRequest().getPath().value();
        Optional<Long> entryRouteId = pathMatcher.match(requestPath);

        if (entryRouteId.isEmpty()) {
            log.info("Dispatch: no path match for {} ({} patterns registered)", requestPath, pathMatcherSize());
            return Mono.empty();
        }

        Route entryRoute = routeMap.get(entryRouteId.get());
        if (entryRoute == null) {
            log.info("Dispatch: path matched route {} but it is not in the published route map", entryRouteId.get());
            return Mono.empty();
        }

        if ("BACKEND".equals(entryRoute.getRouteType())) {
            return Mono.just(new ResolvedRoute(
                    entryRoute.getId(),
                    entryRoute.getUpstreamUrl(),
                    entryRoute.getPath(),
                    List.of(entryRoute.getId())
            ));
        }

        Set<Long> visited = new HashSet<>();
        visited.add(entryRoute.getId());
        List<Long> dispatchPath = new ArrayList<>();
        dispatchPath.add(entryRoute.getId());

        return ensureBodyCachedIfNeeded(exchange)
                .then(dispatchRecursive(exchange, entryRoute, visited, dispatchPath, 1));
    }

    private Mono<Void> ensureBodyCachedIfNeeded(ServerWebExchange exchange) {
        if (exchange.getAttribute(GatewayConstants.CACHED_REQUEST_BODY_KEY) != null) {
            return Mono.empty();
        }
        if (!hasBodyDependentConditions()) {
            return Mono.empty();
        }
        return org.springframework.core.io.buffer.DataBufferUtils.join(
                        exchange.getRequest().getBody(), 1024 * 1024)
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    org.springframework.core.io.buffer.DataBufferUtils.release(dataBuffer);
                    exchange.getAttributes().put(GatewayConstants.CACHED_REQUEST_BODY_KEY,
                            new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                    return (Void) null;
                })
                .switchIfEmpty(Mono.fromRunnable(() ->
                        exchange.getAttributes().put(GatewayConstants.CACHED_REQUEST_BODY_KEY, "")));
    }

    private boolean hasBodyDependentConditions() {
        return conditionMap.values().stream()
                .flatMap(List::stream)
                .anyMatch(c -> "BODY".equals(c.getConditionType()) || "GROOVY".equals(c.getConditionType()));
    }

    private Mono<ResolvedRoute> dispatchRecursive(ServerWebExchange exchange, Route currentRoute,
                                                   Set<Long> visited, List<Long> dispatchPath, int depth) {
        if (depth > GatewayConstants.MAX_DISPATCH_DEPTH) {
            return Mono.error(new DepthExceededException(depth));
        }

        List<RouteCondition> conditions = conditionMap.getOrDefault(currentRoute.getId(), List.of());
        List<RouteCondition> sorted = new ArrayList<>(conditions);
        sorted.sort(Comparator.comparingInt(RouteCondition::getPriority));

        for (RouteCondition condition : sorted) {
            if (conditionMatcher.match(exchange, condition)) {
                Long targetId = condition.getTargetRouteId();
                if (visited.contains(targetId)) {
                    return Mono.error(new CyclicReferenceException(
                            buildCyclePath(dispatchPath, targetId)));
                }

                Route targetRoute = targetId == null ? null : routeMap.get(targetId);
                if (targetRoute == null) {
                    log.warn("Dispatch route {} condition {}={} matched but target route {} is missing/unpublished",
                            currentRoute.getId(), condition.getConditionKey(), condition.getConditionValue(), targetId);
                    continue;
                }

                if ("BACKEND".equals(targetRoute.getRouteType())) {
                    List<Long> fullPath = new ArrayList<>(dispatchPath);
                    fullPath.add(targetId);
                    return Mono.just(new ResolvedRoute(
                            targetRoute.getId(),
                            targetRoute.getUpstreamUrl(),
                            targetRoute.getPath(),
                            fullPath
                    ));
                }

                visited.add(targetId);
                dispatchPath.add(targetId);
                return dispatchRecursive(exchange, targetRoute, visited, dispatchPath, depth + 1);
            }
        }

        log.info("Dispatch route {} resolved no target from {} condition(s)", currentRoute.getId(), sorted.size());
        return Mono.empty();
    }

    private int pathMatcherSize() {
        return pathMatcher != null ? pathMatcher.size() : -1;
    }

    private String buildCyclePath(List<Long> dispatchPath, Long cycleTarget) {
        StringBuilder sb = new StringBuilder();
        for (Long id : dispatchPath) {
            if (!sb.isEmpty()) sb.append(" -> ");
            sb.append(id);
        }
        sb.append(" -> ").append(cycleTarget);
        return sb.toString();
    }
}
