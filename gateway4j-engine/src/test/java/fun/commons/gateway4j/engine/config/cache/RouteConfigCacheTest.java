package fun.commons.gateway4j.engine.config.cache;

import fun.commons.gateway4j.common.model.Route;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RouteConfigCacheTest {

    private RouteConfigCache cache;

    @BeforeEach
    void setUp() {
        cache = new RouteConfigCache();
    }

    @Test
    void putAndGet() {
        Route route = Route.builder().id(1L).routeType("BACKEND").path("/api/users").build();
        cache.putRoute(route);
        assertEquals(route, cache.getRoute(1L));
    }

    @Test
    void getMissingReturnsNull() {
        assertNull(cache.getRoute(999L));
    }

    @Test
    void invalidate() {
        cache.putRoute(Route.builder().id(1L).routeType("BACKEND").build());
        cache.invalidateRoute(1L);
        assertNull(cache.getRoute(1L));
    }

    @Test
    void refreshAll() {
        List<Route> routes = List.of(
                Route.builder().id(1L).routeType("BACKEND").path("/a").build(),
                Route.builder().id(2L).routeType("DISPATCH").path("/b").build()
        );
        cache.refreshAll(routes);
        assertEquals(2, cache.getAllRoutes().size());
    }

    @Test
    void getBackendRoutes() {
        cache.refreshAll(List.of(
                Route.builder().id(1L).routeType("BACKEND").build(),
                Route.builder().id(2L).routeType("DISPATCH").build(),
                Route.builder().id(3L).routeType("BACKEND").build()
        ));
        assertEquals(2, cache.getBackendRoutes().size());
    }

    @Test
    void getDispatchRoutes() {
        cache.refreshAll(List.of(
                Route.builder().id(1L).routeType("BACKEND").build(),
                Route.builder().id(2L).routeType("DISPATCH").build()
        ));
        assertEquals(1, cache.getDispatchRoutes().size());
    }

    @Test
    void getByPath() {
        cache.putRoute(Route.builder().id(1L).routeType("BACKEND").path("/api/users").build());
        assertNotNull(cache.getByPath("/api/users"));
        assertNull(cache.getByPath("/api/orders"));
    }
}
