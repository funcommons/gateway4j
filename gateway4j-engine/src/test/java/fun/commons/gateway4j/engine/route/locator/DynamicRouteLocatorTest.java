package fun.commons.gateway4j.engine.route.locator;

import fun.commons.gateway4j.common.model.Route;
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
}
