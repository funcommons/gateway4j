package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * P2-5 环境间 diff 单测：仅存在 / 仅变更 / 无差异 / 环境不存在。
 */
class RouteEnvironmentDiffServiceTest {

    @Mock private RouteService routeService;

    private RouteEnvironmentDiffService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new RouteEnvironmentDiffService(routeService);
    }

    private Route route(String name, String env, String path, String upstream,
                        String status, int sortOrder, String remark) {
        return Route.builder()
                .id(1L).routeName(name).routeType("BACKEND")
                .path(path).upstreamUrl(upstream)
                .status(status).sortOrder(sortOrder).remark(remark)
                .environment(env)
                .build();
    }

    @Test
    void onlyExistsOnEachSide() {
        when(routeService.listRoutes(null, null, null, null, "default"))
                .thenReturn(List.of(route("a", "default", "/a", "http://a", "PUBLISHED", 1, null)));
        when(routeService.listRoutes(null, null, null, null, "staging"))
                .thenReturn(List.of(route("b", "staging", "/b", "http://b", "DRAFT", 2, null)));

        Map<String, Object> report = service.diff("default", "staging");

        assertEquals("default", report.get("from"));
        assertEquals("staging", report.get("to"));
        List<?> onlyInFrom = (List<?>) report.get("only_in_from");
        List<?> onlyInTo = (List<?>) report.get("only_in_to");
        assertEquals(1, onlyInFrom.size());
        assertEquals("a", ((Map<?, ?>) onlyInFrom.get(0)).get("route_name"));
        assertEquals("default", ((Map<?, ?>) onlyInFrom.get(0)).get("environment"));
        assertEquals(1, onlyInTo.size());
        assertEquals("b", ((Map<?, ?>) onlyInTo.get(0)).get("route_name"));
        assertTrue(((List<?>) report.get("changed")).isEmpty());
    }

    @Test
    void changedReportsPerFieldFromTo() {
        when(routeService.listRoutes(null, null, null, null, "default"))
                .thenReturn(List.of(route("api", "default", "/api", "http://a:8080", "PUBLISHED", 1, "same")));
        when(routeService.listRoutes(null, null, null, null, "staging"))
                .thenReturn(List.of(route("api", "staging", "/api-v2", "http://a:8080", "DRAFT", 1, "same")));

        Map<String, Object> report = service.diff("default", "staging");

        assertTrue(((List<?>) report.get("only_in_from")).isEmpty());
        assertTrue(((List<?>) report.get("only_in_to")).isEmpty());
        List<?> changed = (List<?>) report.get("changed");
        assertEquals(1, changed.size());
        Map<?, ?> item = (Map<?, ?>) changed.get(0);
        assertEquals("api", item.get("route_name"));
        Map<?, ?> fields = (Map<?, ?>) item.get("fields");
        assertEquals(2, fields.size());
        assertEquals(Map.of("from", "/api", "to", "/api-v2"), fields.get("path"));
        assertEquals(Map.of("from", "PUBLISHED", "to", "DRAFT"), fields.get("status"));
        // upstream_url/sort_order/remark 一致 → 不出现
        assertFalse(fields.containsKey("upstream_url"));
        assertFalse(fields.containsKey("sort_order"));
        assertFalse(fields.containsKey("remark"));
    }

    @Test
    void identicalRoutesProduceEmptyDiff() {
        when(routeService.listRoutes(null, null, null, null, "default"))
                .thenReturn(List.of(route("api", "default", "/api", "http://a", "PUBLISHED", 1, "r")));
        when(routeService.listRoutes(null, null, null, null, "staging"))
                .thenReturn(List.of(route("api", "staging", "/api", "http://a", "PUBLISHED", 1, "r")));

        Map<String, Object> report = service.diff("default", "staging");

        assertTrue(((List<?>) report.get("only_in_from")).isEmpty());
        assertTrue(((List<?>) report.get("only_in_to")).isEmpty());
        assertTrue(((List<?>) report.get("changed")).isEmpty(), "字段全一致 → changed 为空");
    }

    @Test
    void missingEnvironmentThrows() {
        when(routeService.listRoutes(null, null, null, null, "default"))
                .thenReturn(List.of(route("a", "default", "/a", "http://a", "DRAFT", 1, null)));
        when(routeService.listRoutes(null, null, null, null, "ghost"))
                .thenReturn(List.of());

        // to 环境不存在（该环境无任何路由）→ 业务异常
        assertThrows(BusinessException.class, () -> service.diff("default", "ghost"));
        // from 环境不存在同样拒绝
        assertThrows(BusinessException.class, () -> service.diff("ghost", "default"));
        // 非法环境标识（白名单外）同样拒绝
        assertThrows(BusinessException.class, () -> service.diff("default", "PROD X!"));
        // 缺省环境标识拒绝
        assertThrows(BusinessException.class, () -> service.diff(" ", "default"));
    }
}
