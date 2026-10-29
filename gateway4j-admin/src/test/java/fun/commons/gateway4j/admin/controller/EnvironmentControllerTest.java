package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.RouteService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import fun.commons.gateway4j.common.model.Route;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** T6：GET /v1/environments —— distinct environment + 保证 default + default 优先排序。 */
@ExtendWith(MockitoExtension.class)
class EnvironmentControllerTest {

    @Mock private RouteService routeService;
    @InjectMocks private EnvironmentController controller;

    @Test
    void returnsDistinctEnvironmentsWithDefaultFirst() {
        when(routeService.listObjs(org.mockito.ArgumentMatchers.<Wrapper<Route>>any()))
                .thenReturn(List.of("staging", "default", "prod-x"));

        Map<String, Object> result = controller.listEnvironments();

        assertEquals(List.of("default", "prod-x", "staging"), result.get("environments"),
                "default 优先，其余字母序，distinct");
    }

    @Test
    void alwaysIncludesDefaultEvenWhenNoRoutes() {
        when(routeService.listObjs(org.mockito.ArgumentMatchers.<Wrapper<Route>>any()))
                .thenReturn(List.of());

        Map<String, Object> result = controller.listEnvironments();

        assertEquals(List.of("default"), result.get("environments"), "空库也保证含 default");
    }

    @Test
    void skipsBlankAndNullEnvironmentValues() {
        // List.of 不允许 null 元素 → 用 Arrays.asList 模拟可能出现的脏值
        when(routeService.listObjs(org.mockito.ArgumentMatchers.<Wrapper<Route>>any()))
                .thenReturn(java.util.Arrays.asList(null, "  ", "gray"));

        Map<String, Object> result = controller.listEnvironments();

        assertEquals(List.of("default", "gray"), result.get("environments"));
    }
}
