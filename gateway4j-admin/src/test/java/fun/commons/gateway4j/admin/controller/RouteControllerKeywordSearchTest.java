package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.gateway4j.admin.service.ConfigSyncStatusService;
import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RouteEnvironmentDiffService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.admin.service.RouteVersionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S7-5 T 步（RED）：路由列表 keyword 参数的 HTTP 层契约钉（服务端搜索消 ⌘K 面板
 * 全量拉带宽，P3 池遗留④）。纯增量：不改业务代码、不动 RouteControllerSyncStatusTest /
 * RouteControllerParamBindingTest 存量用例。
 *
 * <p><b>契约（与 {@link RouteServiceKeywordSearchTest} 服务层裁决同一份，此处钉 HTTP 面）</b>：
 * GET /v1/routes?keyword=xxx —— ① keyword 透传 {@code routeService.listRouteTree(routeType,
 * status, keyword, tag, environment)} 第 3 参（5 参签名既有，见 RouteControllerParamBindingTest
 * 同款 verify 钉法）；② 响应体为命中行<b>平铺数组</b>（每行 children=[]，节点 schema 与树模式
 * 一致：id 为字符串、children 键恒在）；③ 无 keyword → 原树全量（既有行为，守卫钉）；
 * ④ 无命中 → 空数组（信封口径照旧：本端点为裸 List 非 ApiResponse 信封——既有事实，非本票演进）。</p>
 *
 * <p><b>RED 类型澄清</b>：controller 端点与 keyword 形参<b>均已存在</b>（RouteController
 * L92-99），故本文件四用例今日全绿——HTTP 面无 404 型 RED 亦无参数缺失型 RED，真正的
 * RED 在服务层行为缺失（见 RouteServiceKeywordSearchTest：无内存过滤 → 检索不生效）。
 * 本文件角色 = 契约固化钉：防 C 步改服务层时破坏参数绑定/序列化既有事实，并钉住
 * 「keyword 与既有过滤参数可组合」这一 C 步必须保持的语义。</p>
 *
 * <p><b>模式引用</b>：standalone MockMvc + @InjectMocks + lenient() 桩，跟随
 * {@link RouteControllerSyncStatusTest}（P4f 教训应用先例 RouteControllerParamBindingTest：
 * snake_case 形参必须显式 name=——keyword 本身无大小写分叉，但 route_type 组合断言沿用
 * 既有显式 name="route_type" 绑定事实）。</p>
 */
@ExtendWith(MockitoExtension.class)
class RouteControllerKeywordSearchTest {

    @Mock private RouteService routeService;
    @Mock private RouteCanvasService routeCanvasService;
    @Mock private RouteCanvasApplyService routeCanvasApplyService;
    @Mock private RouteBindingService routeBindingService;
    @Mock private RouteTransferService routeTransferService;
    @Mock private ImportSnapshotService importSnapshotService;
    @Mock private RouteEnvironmentDiffService routeEnvironmentDiffService;
    @Mock private RouteVersionService routeVersionService;
    @Mock private ConfigSyncStatusService configSyncStatusService;
    @InjectMocks private RouteController controller;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    /** 平铺命中行桩：与 RouteService.toTreeNode 输出 schema 同形（children 恒在且为空数组）。 */
    private Map<String, Object> flatHitNode(String id, String routeName, String path) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("route_name", routeName);
        node.put("route_type", "BACKEND");
        node.put("path", path);
        node.put("status", "PUBLISHED");
        node.put("sort_order", 1);
        node.put("tags", "");
        node.put("environment", "default");
        node.put("config_version", "3");
        node.put("created_at", 0L);
        node.put("updated_at", 0L);
        node.put("plugins", List.of());
        node.put("children", List.of());
        return node;
    }

    /** keyword 透传第 3 参 + 平铺命中行经裸 List 序列化（id 为字符串、children=[] 恒在）。 */
    @Test
    void keywordParamBindsIntoThirdArgAndSerializesFlatHits() throws Exception {
        lenient().when(routeService.listRouteTree(null, null, "pay", null, null))
                .thenReturn(List.of(flatHitNode("2", "pay-child", "/api/pay/**")));

        mockMvc.perform(get("/v1/routes").param("keyword", "pay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("2"))
                .andExpect(jsonPath("$[0].route_name").value("pay-child"))
                .andExpect(jsonPath("$[0].path").value("/api/pay/**"))
                .andExpect(jsonPath("$[0].children.length()").value(0));

        verify(routeService).listRouteTree(null, null, "pay", null, null);
    }

    /** 无 keyword → 5 参全 null（原树全量走既有行为，守卫钉）。 */
    @Test
    void keywordAbsentPassesNullThrough() throws Exception {
        lenient().when(routeService.listRouteTree(null, null, null, null, null))
                .thenReturn(List.of());

        mockMvc.perform(get("/v1/routes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(routeService).listRouteTree(null, null, null, null, null);
    }

    /** keyword 与既有过滤参数组合（route_type 显式 name= 绑定事实，P4f 教训沿用）：
     * 二者各自落位，互不挤占。 */
    @Test
    void keywordComposesWithRouteTypeFilter() throws Exception {
        lenient().when(routeService.listRouteTree("DISPATCH", null, "pay", null, null))
                .thenReturn(List.of());

        mockMvc.perform(get("/v1/routes")
                        .param("route_type", "DISPATCH")
                        .param("keyword", "pay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(routeService).listRouteTree("DISPATCH", null, "pay", null, null);
    }

    /** 无命中 → 空数组（服务层契约在 HTTP 面的投影；非信封包装——既有裸 List 口径）。 */
    @Test
    void keywordNoMatchReturnsBareEmptyArray() throws Exception {
        lenient().when(routeService.listRouteTree(null, null, "no-such-keyword", null, null))
                .thenReturn(List.of());

        mockMvc.perform(get("/v1/routes").param("keyword", "no-such-keyword"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== 类级契约钉（既有事实，防 C 步漂移） ====================

    /** /v1/routes 类级映射 + @RequiresToken("BEARER") 不因 keyword 演进而动（SyncStatusTest 同款钉法）。 */
    @Test
    void classLevelMappingAndTokenRequirementUnchanged() {
        RequestMapping mapping = RouteController.class.getAnnotation(RequestMapping.class);
        assertNotNull(mapping);
        assertEquals(1, mapping.value().length);
        assertEquals("/v1/routes", mapping.value()[0]);
        RequiresToken token = RouteController.class.getAnnotation(RequiresToken.class);
        assertNotNull(token);
        assertEquals("BEARER", token.value());

        Method endpoint = Stream.of(RouteController.class.getMethods())
                .filter(m -> "listRoutes".equals(m.getName()))
                .findFirst().orElseThrow();
        assertEquals(5, endpoint.getParameterCount(), "listRoutes 五参（含 keyword 第 3 参）签名稳定");
        assertTrue(Arrays.stream(endpoint.getParameters())
                        .anyMatch(p -> "keyword".equals(p.getName())),
                "keyword 形参名编译期保留（-parameters），绑定事实可反射钉住");
    }
}
