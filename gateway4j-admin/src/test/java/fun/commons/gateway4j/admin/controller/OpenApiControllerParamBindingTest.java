package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
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
 * P4f-2 T 步（RED）：开放接口导出 snake_case 绑定回归钉（同款隐患清单 #10）。
 *
 * <p>契约 15.2 GET /v1/open/routes/export「同 14.1」→ route_ids 契约参数名；
 * OpenApiController exportRoutes 形参 camelCase routeIds（无显式 name=）→ 绑不上 → 退化为导出全部。
 * 与 RouteController /export 同款（同一 RouteTransferService 下游），修复需两处同步。</p>
 */
class OpenApiControllerParamBindingTest {

    private RouteTransferService routeTransferService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        routeTransferService = mock(RouteTransferService.class);
        OpenApiController controller = new OpenApiController(routeTransferService, mock(RouteService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void exportRoutesBindsSnakeCaseRouteIds() throws Exception {
        mockMvc.perform(get("/v1/open/routes/export").param("route_ids", "3,4"))
                .andExpect(status().isOk());

        // 修复前：route_ids 绑 camelCase routeIds 形参失败 → 收到 null → verify 失败（RED）
        verify(routeTransferService).exportRoutes(List.of(3L, 4L), null);
    }
}
