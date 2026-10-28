package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RouteTest {

    @Test
    void defaultStatus() {
        Route route = Route.builder().build();
        assertEquals("DRAFT", route.getStatus());
    }

    @Test
    void defaultConfigVersion() {
        Route route = Route.builder().build();
        assertEquals(0L, route.getConfigVersion());
    }

    @Test
    void defaultSortOrder() {
        Route route = Route.builder().build();
        assertEquals(0, route.getSortOrder());
    }

    @Test
    void builderWithAllFields() {
        Route route = Route.builder()
                .id(123456L)
                .routeName("test-route")
                .routeType("DISPATCH")
                .path("/api/**")
                .upstreamUrl("http://backend:8080")
                .status("PUBLISHED")
                .parentRouteId(1L)
                .sortOrder(10)
                .remark("test remark")
                .configVersion(5L)
                .build();

        assertEquals(123456L, route.getId());
        assertEquals("test-route", route.getRouteName());
        assertEquals("DISPATCH", route.getRouteType());
        assertEquals("/api/**", route.getPath());
        assertEquals("http://backend:8080", route.getUpstreamUrl());
        assertEquals("PUBLISHED", route.getStatus());
        assertEquals(1L, route.getParentRouteId());
        assertEquals(10, route.getSortOrder());
        assertEquals("test remark", route.getRemark());
        assertEquals(5L, route.getConfigVersion());
    }

    @Test
    void setterGetter() {
        Route route = new Route();
        route.setRouteName("updated");
        assertEquals("updated", route.getRouteName());
    }
}
