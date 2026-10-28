package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MonitorControllerTest {

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;

    private MonitorController controller;

    @BeforeEach
    void setUp() {
        controller = new MonitorController(new SimpleMeterRegistry(), routeService, conditionMapper);
    }

    @Test
    void listRouteStatusAll() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        List<Map<String, Object>> result = controller.listRouteStatus(null);
        assertEquals(1, result.size());
        assertEquals("1", result.get(0).get("route_id"));
        assertEquals("HEALTHY", result.get(0).get("status"));
    }

    @Test
    void listRouteStatusById() {
        Route route = Route.builder().id(1L).routeName("r1").build();
        when(routeService.getById(1L)).thenReturn(route);
        List<Map<String, Object>> result = controller.listRouteStatus("1");
        assertEquals(1, result.size());
    }

    @Test
    void routeMetrics() {
        Route route = Route.builder().id(1L).path("/api/a").build();
        when(routeService.getById(1L)).thenReturn(route);
        Map<String, Object> result = controller.routeMetrics(1L, "1h", "1m");
        assertEquals("1", result.get("route_id"));
        assertTrue(((List<?>) result.get("data_points")).size() > 0);
        assertTrue(result.containsKey("granularity"));
    }

    @Test
    void getTopology() {
        Route r1 = Route.builder().id(1L).routeName("dispatch").routeType("DISPATCH").build();
        Route r2 = Route.builder().id(2L).routeName("backend").routeType("BACKEND").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(r1, r2));
        when(conditionMapper.selectList(null)).thenReturn(List.of(
                RouteCondition.builder().routeId(1L).targetRouteId(2L)
                        .conditionType("HEADER").operator("EQ").conditionKey("X-V").build()));

        Map<String, Object> result = controller.getTopology();
        List<?> nodes = (List<?>) result.get("nodes");
        List<?> edges = (List<?>) result.get("edges");
        assertEquals(2, nodes.size());
        assertEquals(1, edges.size());
        Map<?, ?> edge = (Map<?, ?>) edges.get(0);
        assertEquals("1", edge.get("source_id"));
        assertEquals("2", edge.get("target_id"));
    }
}
