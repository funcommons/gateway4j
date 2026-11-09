package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RouteEnvironmentDiffService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.admin.service.RouteVersionService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4f-2 T 步（RED）：路由端点 snake_case 绑定回归钉（同款隐患清单 #8/#9）。
 *
 * <p>契约（API_CONTRACT.md 4.1 L167）为 GET /v1/routes 文档化 route_type 查询参数；
 * 14.1 GET /v1/routes/export 契约 route_ids 且前端 routes.ts exportRoutes 实发 route_ids（L254）。
 * RouteController 对应形参 camelCase（routeType/routeIds，无显式 name=）→ 绑不上 → 过滤/指定导出静默失效。</p>
 */
class RouteControllerParamBindingTest {

    private RouteService routeService;
    private RouteTransferService routeTransferService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        routeService = mock(RouteService.class);
        routeTransferService = mock(RouteTransferService.class);
        RouteController controller = new RouteController(routeService,
                mock(RouteCanvasService.class), mock(RouteCanvasApplyService.class),
                mock(RouteBindingService.class), routeTransferService,
                mock(ImportSnapshotService.class), mock(RouteEnvironmentDiffService.class),
                mock(RouteVersionService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void listRoutesBindsSnakeCaseRouteType() throws Exception {
        mockMvc.perform(get("/v1/routes").param("route_type", "DISPATCH"))
                .andExpect(status().isOk());

        // 修复前：route_type 绑 camelCase routeType 形参失败 → 收到 null → 树形全量 → verify 失败（RED）
        verify(routeService).listRouteTree("DISPATCH", null, null, null, null);
    }

    @Test
    void exportRoutesBindsSnakeCaseRouteIds() throws Exception {
        mockMvc.perform(get("/v1/routes/export").param("route_ids", "1,2"))
                .andExpect(status().isOk());

        // 修复前：route_ids 绑 camelCase routeIds 形参失败 → 收到 null → 退化为导出全部 → verify 失败（RED）
        verify(routeTransferService).exportRoutes(List.of(1L, 2L), null, null);
    }
}
