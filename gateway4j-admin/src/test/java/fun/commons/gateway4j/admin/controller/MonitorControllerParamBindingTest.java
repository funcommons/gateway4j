package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.MonitorTimeseriesService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteSimulateService;
import fun.commons.gateway4j.admin.service.RouteTrafficSummaryService;
import fun.commons.gateway4j.admin.service.UpstreamHealthProbe;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4f-2 T 步（RED）：monitor 兼容端点 snake_case 绑定回归钉（同款隐患清单 #6/#7）。
 *
 * <p>前端 misc.ts：listRouteStatus 发 route_id（L23）、getRouteMetrics 发 time_range（L43）；
 * MonitorController 对应端点 @RequestParam 形参为 camelCase（routeId/timeRange，无显式 name=）→
 * 绑不上 → 单路由 status 过滤失效 / metrics 时程恒落默认 1h。
 * 对照：/gateway/timeseries 已显式 name="time_range"（正确形态）；/timeseries 前端发 camelCase（双侧一致，不在本票范围）。</p>
 */
class MonitorControllerParamBindingTest {

    private RouteService routeService;
    private MonitorTimeseriesService timeseriesService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        routeService = mock(RouteService.class);
        timeseriesService = mock(MonitorTimeseriesService.class);
        MonitorController controller = new MonitorController(routeService,
                mock(RouteConditionMapper.class), timeseriesService,
                mock(RouteSimulateService.class), mock(RouteTrafficSummaryService.class),
                mock(UpstreamHealthProbe.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void listRouteStatusBindsSnakeCaseRouteId() throws Exception {
        // RED 路径兜底：routeId 绑不上时 controller 走全量分支 listRoutes(null,null,null)
        when(routeService.listRoutes(any(), any(), any())).thenReturn(List.of());

        // route_id 未命中（mock getById 默认 null）→ 空列表响应，200 即可
        mockMvc.perform(get("/v1/monitor/routes/status").param("route_id", "42"))
                .andExpect(status().isOk());

        // 修复前：route_id 绑 camelCase routeId 形参失败 → 收到 null → 走全量分支 → verify 失败（RED）
        verify(routeService).getById(42L);
    }

    @Test
    void routeMetricsBindsSnakeCaseTimeRange() throws Exception {
        whenSnapshotFlatPointsReturnsEmpty();

        mockMvc.perform(get("/v1/monitor/routes/7/metrics").param("time_range", "6h"))
                .andExpect(status().isOk());

        // 修复前：time_range 绑不上 → timeRange 恒落默认 "1h" → verify 失败（RED）
        verify(timeseriesService).snapshotFlatPoints(null, "6h", "1m");
    }

    private void whenSnapshotFlatPointsReturnsEmpty() {
        org.mockito.Mockito.when(timeseriesService.snapshotFlatPoints(any(), anyString(), anyString()))
                .thenReturn(Map.of());
    }
}
