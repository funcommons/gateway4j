package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.ConfigSyncStatusService;
import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RouteEnvironmentDiffService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.admin.service.RouteVersionService;
import fun.commons.gateway4j.admin.web.AdminGlobalExceptionHandler;
import fun.commons.gateway4j.common.model.Route;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * OPT-6-BE T 步（RED）：per-route 同步状态端点 {@code GET /v1/routes/{id}/sync-status}。
 *
 * <p><b>测试即契约</b>（全局端点 GET /v1/config/sync-status 的 per-route 版，复用同一份网关水位）：
 * <pre>
 * &#64;GetMapping("/{id}/sync-status")
 * public ApiResponse&lt;Map&lt;String, Object&gt;&gt; routeSyncStatus(@PathVariable Long id) {
 *     Route route = routeService.getById(id);
 *     if (route == null) throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);  // 与 getRoute 同款
 *     Map&lt;String, Object&gt; status = configSyncStatusService.readSyncStatus();
 *     // 拼装 data = { route_id, route_config_version（该行现值）, available,
 *     //              gateway{version,fingerprint,updated_at,instance}, db_version, in_sync }
 *     return ApiResponse.success(merged);
 * }
 * </pre>
 * in_sync 沿用全局口径（available && gateway.version == db_version），<b>不做</b> per-route
 * 版本比较——route_config_version 是「该路由行上次发布时的版本」，与全局水位天然不等
 * （任一路由发布即抬全局版本），per-route 比较会对全部未改路由误报（OPT-6 侦察裁决）。</p>
 *
 * <p><b>RED 机制</b>：端点尚未实现 → standalone MockMvc 对 /v1/routes/{id}/sync-status
 * 返回 404，全部断言失败；RouteController 类真实存在故零编译错误。类级注解断言
 * （/v1/routes + &#64;RequiresToken("BEARER")）在 RED 期即通过——它们钉住既有事实，
 * 由「端点方法不存在」断言承担 RED 信号。</p>
 *
 * <p><b>模式引用</b>：standalone MockMvc + &#64;InjectMocks 跟随
 * {@link RouteControllerParamBindingTest}（constructor mock 注入）与
 * AdminGlobalExceptionHandlerTest（setControllerAdvice 转失败信封 +
 * jsonPath("$.code") 断言）。&#64;InjectMocks 而非 new RouteController(...)：
 * C 步为端点追加 ConfigSyncStatusService 构造参数后本文件零改动可编译。
 * 桩一律 lenient()（MonitorControllerTest 同款）：RED 期端点不存在、桩不被消费，
 * STRICT_STUBS 会以 UnnecessaryStubbingException 污染 RED 信号。</p>
 *
 * <p><b>给 C 步的三条实现约束</b>（由本文件断言倒逼）：
 * ① gateway 可为 null（available=false 降级）→ 拼装必须用 LinkedHashMap（Map.of 不接受 null value）；
 * ② 路由不存在 → BusinessException(ROUTE_NOT_FOUND=10601) → AdminGlobalExceptionHandler
 *    转失败信封（HTTP 200，framework4j 全异常 200 口径，AuthException 除外）；
 * ③ route_id / route_config_version / db_version 为 JSON 数字（非字符串）。</p>
 */
@ExtendWith(MockitoExtension.class)
class RouteControllerSyncStatusTest {

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
        // AdminGlobalExceptionHandler：BusinessException → HTTP 200 失败信封（与容器行为一致）
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new AdminGlobalExceptionHandler())
                .build();
    }

    // ==================== 1. in_sync=true 全字段拼装 ====================

    /** 网关水位追平 DB → in_sync=true；route_config_version 必须取该路由行现值（7），非全局版本。 */
    @Test
    void syncStatusInSyncAssemblesFullEnvelope() throws Exception {
        Route route = Route.builder().id(1L).routeName("users-api").routeType("BACKEND")
                .configVersion(7L).build();
        lenient().when(routeService.getById(1L)).thenReturn(route);
        lenient().when(configSyncStatusService.readSyncStatus())
                .thenReturn(syncStatus(watermark(7L), 7L));

        mockMvc.perform(get("/v1/routes/1/sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.route_id").value(1))
                .andExpect(jsonPath("$.data.route_config_version").value(7))
                .andExpect(jsonPath("$.data.available").value(true))
                .andExpect(jsonPath("$.data.gateway.version").value(7))
                .andExpect(jsonPath("$.data.gateway.fingerprint")
                        .value("9f2c4a7e1b8d4f6a9c0e2b4d6f8a0c2e"))
                .andExpect(jsonPath("$.data.gateway.updated_at").value(1731200000000L))
                .andExpect(jsonPath("$.data.gateway.instance").value("gw-node-1"))
                .andExpect(jsonPath("$.data.db_version").value(7))
                .andExpect(jsonPath("$.data.in_sync").value(true));

        verify(configSyncStatusService).readSyncStatus();
        verify(routeService).getById(1L);
    }

    // ==================== 2. in_sync=false（gateway.version != db_version） ====================

    /** 网关水位落后（6 < 7）→ 数据仍全量返回、信封层成功，仅 in_sync=false。 */
    @Test
    void syncStatusVersionMismatchReportsNotInSync() throws Exception {
        Route route = Route.builder().id(2L).routeName("orders-api").routeType("BACKEND")
                .configVersion(7L).build();
        lenient().when(routeService.getById(2L)).thenReturn(route);
        lenient().when(configSyncStatusService.readSyncStatus())
                .thenReturn(syncStatus(watermark(6L), 7L));

        mockMvc.perform(get("/v1/routes/2/sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.route_id").value(2))
                .andExpect(jsonPath("$.data.route_config_version").value(7))
                .andExpect(jsonPath("$.data.gateway.version").value(6))
                .andExpect(jsonPath("$.data.db_version").value(7))
                .andExpect(jsonPath("$.data.in_sync").value(false));
    }

    // ==================== 3. available=false 降级不炸 ====================

    /** Redis 缺失/TTL 过期 → readSyncStatus 降级（available=false, gateway=null）：
     * 端点不得 500，信封层照常成功，in_sync 宁报未同步（false）。 */
    @Test
    void syncStatusDegradedUnavailableStaysOkAndNotInSync() throws Exception {
        lenient().when(routeService.getById(3L)).thenReturn(
                Route.builder().id(3L).routeName("pay-api").routeType("BACKEND")
                        .configVersion(7L).build());
        lenient().when(configSyncStatusService.readSyncStatus())
                .thenReturn(syncStatus(null, 7L));

        mockMvc.perform(get("/v1/routes/3/sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.route_config_version").value(7))
                .andExpect(jsonPath("$.data.available").value(false))
                .andExpect(jsonPath("$.data.gateway").value(nullValue()))
                .andExpect(jsonPath("$.data.in_sync").value(false));
    }

    // ==================== 4. 路由不存在 → 错误信封 ====================

    /** 与 getRoute（GET /{id}）同款：BusinessException(ROUTE_NOT_FOUND) → 10601 失败信封。
     * HTTP 200 为 framework4j 全异常 200 口径（AdminGlobalExceptionHandlerTest 同款断言）。 */
    @Test
    void syncStatusRouteNotFoundReturnsErrorEnvelope() throws Exception {
        lenient().when(routeService.getById(999L)).thenReturn(null);
        lenient().when(configSyncStatusService.readSyncStatus())
                .thenReturn(syncStatus(watermark(7L), 7L));

        mockMvc.perform(get("/v1/routes/999/sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(10601))
                .andExpect(jsonPath("$.message").value("路由未找到"));
    }

    // ==================== 5. 坏 id / 缺 id：参数绑定行为 ====================

    /** 坏 id：{id} 声明为 Long，"abc" 绑不上 → framework4j 全局处理器转类型错误信封
     * （ApiCode.PARAM_FORMAT_ERROR=10102，HTTP 200 全异常口径——探测实锚 GET /v1/routes/{id}
     * 既有行为，非 Spring 裸 400）。转换失败发生在进 controller 前，不触达任何 service。
     * RED 期端点不存在 → 404 → 断言失败。 */
    @Test
    void syncStatusNonNumericIdFailsPathBinding() throws Exception {
        mockMvc.perform(get("/v1/routes/abc/sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(10102))
                .andExpect(jsonPath("$.message").value("参数 [id] 类型不匹配，需要类型: Long"));

        verifyNoInteractions(routeService, configSyncStatusService);
    }

    /** 缺 id（空段 /v1/routes//sync-status）：既有行为同样是类型错误信封（探测实锚：
     * 请求以 {id} 绑不上 Long 告终）。GREEN 后无论解析落在新端点（id 为空 → Long 转换失败）
     * 还是回退既有 GET /v1/routes/{id}，可观测信封一致且不触达 service——契约钉。 */
    @Test
    void syncStatusMissingIdSegmentReturnsTypeMismatchEnvelope() throws Exception {
        mockMvc.perform(get("/v1/routes//sync-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value(10102))
                .andExpect(jsonPath("$.message").value("参数 [id] 类型不匹配，需要类型: Long"));

        verifyNoInteractions(routeService, configSyncStatusService);
    }

    // ==================== 6. 端点注解契约钉（V2RouteControllerTest C3 同款） ====================

    /** 反射静态断言（不起容器）：存在 @GetMapping("/{id}/sync-status") 方法且返回 ApiResponse
     * 信封；新端点挂既有类级 /v1/routes 与 @RequiresToken("BEARER") 下（ConfigController 同款）。
     * RED 信号由「端点方法不存在」承担，类级断言在 RED 期即通过（钉既有事实）。 */
    @Test
    void syncStatusEndpointAnnotationsMatchContract() {
        Method endpoint = Arrays.stream(RouteController.class.getDeclaredMethods())
                .filter(m -> m.isAnnotationPresent(GetMapping.class))
                .filter(m -> Stream.of(m.getAnnotation(GetMapping.class).value(),
                                m.getAnnotation(GetMapping.class).path())
                        .flatMap(Stream::of)
                        .anyMatch(p -> p.contains("{id}/sync-status")))
                .findFirst()
                .orElse(null);

        assertNotNull(endpoint, "RED：RouteController 尚未声明 GET {id}/sync-status 端点");
        assertEquals(ApiResponse.class, endpoint.getReturnType(),
                "返回类型必须是 ApiResponse 信封（data 内字段 snake_case）");

        RequestMapping classMapping = RouteController.class.getAnnotation(RequestMapping.class);
        assertNotNull(classMapping, "类上必须有 @RequestMapping");
        assertTrue(Stream.of(classMapping.value(), classMapping.path())
                        .flatMap(Stream::of)
                        .anyMatch("/v1/routes"::equals),
                "新端点挂在既有类级 /v1/routes 下");

        RequiresToken token = RouteController.class.getAnnotation(RequiresToken.class);
        assertNotNull(token, "类上必须有 @RequiresToken（framework4j-accesstoken）");
        assertEquals("BEARER", token.value(), "鉴权口径与 ConfigController/既有路由端点一致");
    }

    // ==================== 桩构造（与 ConfigSyncStatusService.readSyncStatus 同构） ====================

    /** 按引擎写入侧契约构造水位 Map；version 用 Integer 模拟真实 JSON payload（Jackson 小数值归一）。 */
    private static Map<String, Object> watermark(long version) {
        Map<String, Object> gateway = new LinkedHashMap<>();
        gateway.put("version", (int) version);
        gateway.put("fingerprint", "9f2c4a7e1b8d4f6a9c0e2b4d6f8a0c2e");
        gateway.put("updated_at", 1731200000000L);
        gateway.put("instance", "gw-node-1");
        return gateway;
    }

    /** 复刻 readSyncStatus() 返回结构：{available, gateway|null, db_version, in_sync}。 */
    private static Map<String, Object> syncStatus(Map<String, Object> gateway, long dbVersion) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", gateway != null);
        result.put("gateway", gateway);
        result.put("db_version", dbVersion);
        result.put("in_sync", gateway != null
                && ((Number) gateway.get("version")).longValue() == dbVersion);
        return result;
    }
}
