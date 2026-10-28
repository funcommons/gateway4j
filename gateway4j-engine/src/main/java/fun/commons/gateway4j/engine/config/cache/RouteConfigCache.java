package fun.commons.gateway4j.engine.config.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import fun.commons.gateway4j.common.model.Route;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class RouteConfigCache {

    private final Cache<Long, Route> cache;
    private volatile Map<String, Route> pathIndex = Map.of();

    public RouteConfigCache() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(10_000)
                .build();
    }

    public Route getRoute(Long id) {
        return cache.getIfPresent(id);
    }

    public List<Route> getAllRoutes() {
        return cache.asMap().values().stream().toList();
    }

    public List<Route> getBackendRoutes() {
        return cache.asMap().values().stream()
                .filter(r -> "BACKEND".equals(r.getRouteType()))
                .toList();
    }

    public List<Route> getDispatchRoutes() {
        return cache.asMap().values().stream()
                .filter(r -> "DISPATCH".equals(r.getRouteType()))
                .toList();
    }

    public Route getByPath(String path) {
        return pathIndex.get(path);
    }

    public void putRoute(Route route) {
        cache.put(route.getId(), route);
        rebuildPathIndex();
    }

    public void invalidateRoute(Long id) {
        cache.invalidate(id);
        rebuildPathIndex();
    }

    public void refreshAll(List<Route> routes) {
        cache.invalidateAll();
        for (Route route : routes) {
            cache.put(route.getId(), route);
        }
        rebuildPathIndex();
    }

    private void rebuildPathIndex() {
        Map<String, Route> index = new ConcurrentHashMap<>();
        for (Route route : cache.asMap().values()) {
            if (route.getPath() != null) {
                index.put(route.getPath(), route);
            }
        }
        this.pathIndex = index;
    }
}
