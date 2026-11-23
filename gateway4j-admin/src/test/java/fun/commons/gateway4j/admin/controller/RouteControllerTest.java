package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.ConfigSyncStatusService;
import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteEnvironmentDiffService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RouteIngressService;
import fun.commons.gateway4j.admin.service.RoutePackage;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.admin.service.RouteVersionService;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCanvas;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RouteControllerTest {

    @Mock private RouteService routeService;
    @Mock private RouteCanvasService routeCanvasService;
    @Mock private RouteCanvasApplyService routeCanvasApplyService;
    @Mock private RouteBindingService routeBindingService;
    @Mock private RouteTransferService routeTransferService;
    @Mock private ImportSnapshotService importSnapshotService;
    @Mock private RouteEnvironmentDiffService routeEnvironmentDiffService;
    @Mock private RouteVersionService routeVersionService;
    @Mock private ConfigSyncStatusService configSyncStatusService;
    @Mock private RouteIngressService routeIngressService;
    @InjectMocks private RouteController controller;

    @Test
    void listRoutes() {
        when(routeService.listRouteTree(null, null, null, null, null)).thenReturn(List.of());
        List<Map<String, Object>> result = controller.listRoutes(null, null, null, null, null);
        assertNotNull(result);
        verify(routeService).listRouteTree(null, null, null, null, null);
    }

    @Test
    void listRoutesWithFilters() {
        when(routeService.listRouteTree("BACKEND", "DRAFT", "api", "prod", null)).thenReturn(List.of());
        List<Map<String, Object>> result = controller.listRoutes("BACKEND", "DRAFT", "api", "prod", null);
        verify(routeService).listRouteTree("BACKEND", "DRAFT", "api", "prod", null);
    }

    @Test
    void createRoute() {
        Route route = Route.builder().id(1L).routeName("test").routeType("BACKEND").build();
        when(routeService.createRouteWithBindings(any(Route.class), any(), any())).thenReturn(route);

        RouteController.RouteCreateRequest request = new RouteController.RouteCreateRequest(
                "test", "BACKEND", "/api/users", "http://users:8080",
                null, 0, null, "prod", null, null, null, null);
        Route result = controller.createRoute(request);
        assertNotNull(result);
        verify(routeService).createRouteWithBindings(any(Route.class), isNull(), isNull());
    }

    /** S12-3：批量 Ingress 建路由端点 —— 委托服务并回信封（data.created[]）。 */
    @Test
    void createIngressRoutes() {
        RouteController.IngressCreateResult created = new RouteController.IngressCreateResult(
                List.of(new RouteController.IngressCreatedRoute(
                        1L, "api_gateway_1", "/api/**", "api.example.com")));
        when(routeIngressService.createIngress(any())).thenReturn(created);

        RouteController.IngressCreateRequest request = new RouteController.IngressCreateRequest(
                "api_gateway", "default", "", "",
                List.of(new RouteController.IngressRuleRequest("api.example.com",
                        List.of(new RouteController.IngressPathRequest("/api", "PREFIX",
                                new RouteController.IngressBackendRequest("user-service", "8080"))))),
                List.of(), List.of());

        var response = controller.createIngressRoutes(request);
        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals(1, response.getData().created().size());
        assertEquals("api_gateway_1", response.getData().created().get(0).routeName());
        verify(routeIngressService).createIngress(request);
    }

    @Test
    void updateRoute() {
        Route existing = Route.builder().id(1L).routeName("old").build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                "new-name", null, null, null, null, null, "prod", null, null, null, null, null);
        Route result = controller.updateRoute(1L, request);
        verify(routeService).updateRouteWithBindings(any(Route.class), isNull(), isNull());
    }

    /** P2-2 多环境：PATCH 不带 environment → 传给服务的实体 environment 必须为 null（不踩既有环境）。 */
    @Test
    void updateRouteWithoutEnvironmentPassesNullToService() {
        Route existing = Route.builder().id(1L).routeName("old").environment("staging").build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                "new-name", null, null, null, null, null, null, null, null, null, null, null);
        controller.updateRoute(1L, request);

        org.mockito.ArgumentCaptor<Route> captor = org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeService).updateRouteWithBindings(captor.capture(), isNull(), isNull());
        assertNull(captor.getValue().getEnvironment(), "不带 environment 的更新不得注入默认值");
    }

    /** P2-2 多环境：PATCH 携带 environment → 透传给服务（环境迁移）。 */
    @Test
    void updateRouteWithEnvironmentPassesThrough() {
        Route existing = Route.builder().id(1L).routeName("old").environment("default").build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                "new-name", null, null, null, null, null, null, "staging", null, null, null, null);
        controller.updateRoute(1L, request);

        org.mockito.ArgumentCaptor<Route> captor = org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeService).updateRouteWithBindings(captor.capture(), isNull(), isNull());
        assertEquals("staging", captor.getValue().getEnvironment());
    }

    // ==================== P1-5 乐观锁（expected_version） ====================

    /** 缺省放行：expected_version 不携带 → 不校验版本，兼容旧调用。 */
    @Test
    void updateRouteWithoutExpectedVersionSkipsVersionCheck() {
        // getById 若被调用也返回 null → 版本检查跳过，仍继续走更新
        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                null, "/api/new", null, null, null, null, null, null, null, null, null, null);
        Route result = controller.updateRoute(1L, request);
        verify(routeService).updateRouteWithBindings(any(Route.class), isNull(), isNull());
    }

    /** 匹配放行：expected_version = 当前 config_version → 正常更新。 */
    @Test
    void updateRouteWithMatchingVersionPasses() {
        Route existing = Route.builder().id(1L).routeName("old").configVersion(3L).build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                "new-name", null, null, null, null, null, null, null, null, null, null, 3L);
        Route result = controller.updateRoute(1L, request);
        verify(routeService).updateRouteWithBindings(any(Route.class), isNull(), isNull());
    }

    /** 不匹配拒绝：expected_version ≠ 当前 config_version → 10402 版本冲突。 */
    @Test
    void updateRouteWithStaleVersionThrows10402() {
        Route existing = Route.builder().id(1L).routeName("old").configVersion(5L).build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                "new-name", null, null, null, null, null, null, null, null, null, null, 3L);
        BusinessException e = assertThrows(BusinessException.class, () -> controller.updateRoute(1L, request));
        assertEquals(10402, e.getCode());
        assertEquals("路由已被他人修改，请刷新后重试", e.getMessage());
        verify(routeService, never()).updateRouteWithBindings(any(), any(), any());
    }

    /**
     * 缺省 + 无该路由：expected_version 携带但路由不存在 → 版本检查放行（跳过），
     * 由 service 层抛 ROUTE_NOT_FOUND（此处 mock 下不抛，仅验证不 10402、不中断）。
     */
    @Test
    void updateRouteVersionCheckSkippedWhenRouteMissing() {
        when(routeService.getById(1L)).thenReturn(null);
        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                null, null, null, null, null, null, null, null, null, null, null, 3L);
        assertDoesNotThrow(() -> controller.updateRoute(1L, request));
        verify(routeService).updateRouteWithBindings(any(Route.class), isNull(), isNull());
    }

    @Test
    void deleteRoute() {
        controller.deleteRoute(1L);
        verify(routeService).deleteRoute(1L);
    }

    @Test
    void publishRoute() {
        Route route = Route.builder().id(1L).status("PUBLISHED").build();
        when(routeService.getById(1L)).thenReturn(route);

        Route result = controller.publishRoute(1L, null);
        // S5a 契约：change_description + actor（测试环境无 token 归 system）持久化
        verify(routeService).publishRoute(1L, null, "system");
    }

    /** P2-4 流程档轻量：publish 可选 body change_description 兼容（无 body 亦可）。 */
    @Test
    void publishRouteWithChangeDescription() {
        Route route = Route.builder().id(1L).status("PUBLISHED").build();
        when(routeService.getById(1L)).thenReturn(route);

        Route result = controller.publishRoute(1L,
                new RouteController.PublishRequest("修复 /api/users 前缀遗漏"));
        verify(routeService).publishRoute(1L, "修复 /api/users 前缀遗漏", "system");
        assertNotNull(result);
    }

    // ==================== P2-5 环境间 diff ====================

    @Test
    void environmentDiffDelegatesToService() {
        Map<String, Object> report = Map.of(
                "from", "default", "to", "staging",
                "only_in_from", List.of(), "only_in_to", List.of(), "changed", List.of());
        when(routeEnvironmentDiffService.diff("default", "staging")).thenReturn(report);

        Map<String, Object> result = controller.environmentDiff("default", "staging");
        assertEquals("default", result.get("from"));
        assertEquals("staging", result.get("to"));
        verify(routeEnvironmentDiffService).diff("default", "staging");
    }

    // ==================== T1：PATCH 静默重置 status（既有缺陷回归） ====================

    /**
     * T1 回归：PATCH 只携带 remark 时，传给服务的实体必须把 @Builder.Default 注入的
     * 默认值（status=DRAFT/sort_order=0/tags=""/config_version=0）置 null——
     * 否则 MyBatis-Plus updateById 会把 OFFLINE 路由静默重置为 DRAFT。
     */
    @Test
    void updateRouteOnlyRemarkPatchCarriesNoBuilderDefaults() {
        Route existing = Route.builder().id(1L).routeName("old").status("OFFLINE").build();
        when(routeService.getById(1L)).thenReturn(existing);

        RouteController.RouteUpdateRequest request = new RouteController.RouteUpdateRequest(
                null, null, null, null, null, "只改备注", null, null, null, null, null, null);
        controller.updateRoute(1L, request);

        org.mockito.ArgumentCaptor<Route> captor = org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeService).updateRouteWithBindings(captor.capture(), isNull(), isNull());
        Route patch = captor.getValue();
        assertNull(patch.getStatus(), "PATCH 未携带 status → 实体不得带 @Builder.Default 的 DRAFT");
        assertNull(patch.getSortOrder(), "PATCH 未携带 sort_order → 不得带默认 0");
        assertNull(patch.getTags(), "PATCH 未携带 tags → 不得带默认空串");
        assertNull(patch.getConfigVersion(), "PATCH 未携带 config_version → 不得带默认 0");
        assertEquals("只改备注", patch.getRemark());
    }

    /** P2-4 流程档轻量：bulk-publish 可选 change_description（透传 3 参重载）。 */
    @Test
    void bulkPublishWithChangeDescription() {
        doNothing().when(routeService).publishRoute(7L, "割接窗口发布", "system");

        Map<String, Object> result = controller.bulkPublish(
                new RouteController.BulkIdsRequest(List.of(7L), "割接窗口发布"));

        assertEquals(1, ((List<?>) result.get("succeeded")).size());
        verify(routeService).publishRoute(7L, "割接窗口发布", "system");
    }

    @Test
    void offlineRoute() {
        Route route = Route.builder().id(1L).status("OFFLINE").build();
        when(routeService.getById(1L)).thenReturn(route);

        Route result = controller.offlineRoute(1L);
        verify(routeService).offlineRoute(1L, "system");
    }

    @Test
    void validateRouteValid() {
        RouteController.RouteValidateRequest request = new RouteController.RouteValidateRequest(
                null, List.of());
        Map<String, Object> result = controller.validateRoute(request);
        assertEquals(true, result.get("is_valid"));
    }

    @Test
    void validateRouteCyclicReference() {
        doThrow(new CyclicReferenceException("1 -> 2 -> 1")).when(routeService)
                .validateRoute(any(), any());

        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1")
                .targetRouteId(2L).priority(0).build();

        RouteController.RouteValidateRequest request = new RouteController.RouteValidateRequest(
                1L, List.of(cond));
        Map<String, Object> result = controller.validateRoute(request);
        assertEquals(false, result.get("is_valid"));
        assertEquals("CYCLIC_REFERENCE", ((List<?>) result.get("errors")).isEmpty() ? null :
                ((Map<?, ?>) ((List<?>) result.get("errors")).get(0)).get("error_code"));
    }

    @Test
    void getRouteDetail() {
        // D3：GET /v1/routes/{id} 路由详情
        Route route = Route.builder().id(1L).routeName("test").routeType("BACKEND").build();
        when(routeService.getById(1L)).thenReturn(route);
        Route result = controller.getRoute(1L);
        assertEquals("test", result.getRouteName());
        verify(routeService).getById(1L);
    }

    @Test
    void getRouteDetailNotFound() {
        when(routeService.getById(404L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> controller.getRoute(404L));
    }

    @Test
    void getCanvas() {
        RouteCanvas canvas = RouteCanvas.builder().routeId(1L).canvasData("{\"nodes\":[]}").build();
        when(routeCanvasService.getCanvas(1L)).thenReturn(canvas);
        RouteCanvas result = controller.getCanvas(1L);
        assertEquals(1L, result.getRouteId());
        verify(routeCanvasService).getCanvas(1L);
    }

    @Test
    void saveCanvas() throws Exception {
        // D19：canvas_data 为 JSON 对象 → 序列化后落库
        var node = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree("{\"nodes\":[],\"edges\":[]}");
        controller.saveCanvas(1L, new RouteController.CanvasRequest(node));
        verify(routeCanvasService).saveCanvas(1L, "{\"nodes\":[],\"edges\":[]}");
    }

    @Test
    void saveCanvasNull() {
        controller.saveCanvas(1L, new RouteController.CanvasRequest(null));
        verify(routeCanvasService).saveCanvas(1L, null);
    }

    @Test
    void addCondition() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ").targetRouteId(2L).build();
        when(routeService.addCondition(eq(1L), any(RouteCondition.class))).thenReturn(cond);
        RouteCondition result = controller.addCondition(1L, cond);
        assertEquals(2L, result.getTargetRouteId());
        verify(routeService).addCondition(eq(1L), any(RouteCondition.class));
    }

    @Test
    void updateCondition() {
        RouteCondition cond = RouteCondition.builder().id(5L).conditionType("PATH").build();
        when(routeService.updateCondition(eq(1L), eq(5L), any(RouteCondition.class))).thenReturn(cond);
        RouteCondition result = controller.updateCondition(1L, 5L, cond);
        assertEquals(5L, result.getId());
        verify(routeService).updateCondition(eq(1L), eq(5L), any(RouteCondition.class));
    }

    @Test
    void deleteCondition() {
        controller.deleteCondition(1L, 5L);
        verify(routeService).deleteCondition(1L, 5L);
    }

    @Test
    void listChildren() {
        when(routeService.listChildren(1L)).thenReturn(List.of());
        List<Route> result = controller.listChildren(1L);
        assertNotNull(result);
        verify(routeService).listChildren(1L);
    }

    @Test
    void sortRoutes() {
        controller.sortRoutes(new RouteController.SortRoutesRequest(List.of(1L, 2L, 3L)));
        verify(routeService).sortRoutes(List.of(1L, 2L, 3L));
    }

    @Test
    void listBindings() {
        when(routeBindingService.listBindings(1L)).thenReturn(List.of());
        List<Map<String, Object>> result = controller.listBindings(1L);
        assertNotNull(result);
        verify(routeBindingService).listBindings(1L);
    }

    @Test
    void bindPlugin() {
        RoutePluginBinding binding = RoutePluginBinding.builder().id(9L).routeId(1L).pluginId(3L).build();
        when(routeBindingService.bindPlugin(1L, 3L, "{}")).thenReturn(binding);
        RoutePluginBinding result = controller.bindPlugin(1L, new RouteController.BindPluginRequest(3L, "{}"));
        assertEquals(9L, result.getId());
        verify(routeBindingService).bindPlugin(1L, 3L, "{}");
    }

    @Test
    void updateBinding() {
        RoutePluginBinding binding = RoutePluginBinding.builder().id(9L).sortOrder(2).build();
        when(routeBindingService.updateBinding(1L, 9L, "{}", 2)).thenReturn(binding);
        RoutePluginBinding result = controller.updateBinding(1L, 9L,
                new RouteController.UpdateBindingRequest("{}", 2));
        assertEquals(2, result.getSortOrder());
        verify(routeBindingService).updateBinding(1L, 9L, "{}", 2);
    }

    @Test
    void unbindPlugin() {
        controller.unbindPlugin(1L, 9L);
        verify(routeBindingService).unbindPlugin(1L, 9L);
    }

    @Test
    void sortRoutePlugins() {
        controller.sortRoutePlugins(1L, new RouteController.SortBindingsRequest("PRE", List.of(9L, 8L)));
        verify(routeBindingService).sortBindings(1L, "PRE", List.of(9L, 8L));
    }

    @Test
    void getPluginChain() {
        when(routeBindingService.getPluginChain(1L)).thenReturn(Map.of("route_id", "1"));
        Map<String, Object> result = controller.getPluginChain(1L);
        assertEquals("1", result.get("route_id"));
        verify(routeBindingService).getPluginChain(1L);
    }

    @Test
    void exportRoutes() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.exportRoutes(null, null, null)).thenReturn(pkg);
        RoutePackage result = controller.exportRoutes(null, null, null);
        assertEquals("1.0", result.version());
        verify(routeTransferService).exportRoutes(null, null, null);
    }

    @Test
    void importRoutes() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.importRoutes(pkg, "SKIP", null)).thenReturn(Map.of("total", 0));
        Map<String, Object> result = controller.importRoutes(
                new RouteController.ImportRequest(pkg, "SKIP"));
        assertEquals(0, result.get("total"));
        verify(routeTransferService).importRoutes(pkg, "SKIP", null);
    }

    @Test
    void validateImport() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.validateImport(pkg, null)).thenReturn(Map.of("is_valid", true));
        Map<String, Object> result = controller.validateImport(pkg, null);
        assertEquals(true, result.get("is_valid"));
        verify(routeTransferService).validateImport(pkg, null);
    }

    // ==================== 阶段二 ====================

    @Test
    void applyCanvas() {
        // T1：画布应用到路由树
        RouteCanvasApplyService.CanvasApplyRequest request =
                new RouteCanvasApplyService.CanvasApplyRequest(List.of(), List.of(), true, null);
        when(routeCanvasApplyService.applyCanvas(1L, request))
                .thenReturn(Map.of("dry_run", true, "to_create", List.of()));

        Map<String, Object> result = controller.applyCanvas(1L, request);
        assertEquals(Boolean.TRUE, result.get("dry_run"));
        verify(routeCanvasApplyService).applyCanvas(1L, request);
    }

    @Test
    void duplicateRoute() {
        // T3：路由复制
        Route copy = Route.builder().id(9L).routeName("test_copy").routeType("BACKEND")
                .status("DRAFT").build();
        when(routeService.duplicateRoute(1L)).thenReturn(copy);

        Route result = controller.duplicateRoute(1L);
        assertEquals("test_copy", result.getRouteName());
        assertEquals("DRAFT", result.getStatus());
        verify(routeService).duplicateRoute(1L);
    }

    @Test
    void bulkPublishPartialSuccess() {
        // T3：批量发布（逐条执行、失败不中断）；2 参构造缺省 description → 透传 null
        doNothing().when(routeService).publishRoute(1L, null, "system");
        doThrow(new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "仅 DRAFT/OFFLINE 状态可发布"))
                .when(routeService).publishRoute(2L, null, "system");

        Map<String, Object> result = controller.bulkPublish(new RouteController.BulkIdsRequest(List.of(1L, 2L)));

        assertEquals(1, ((List<?>) result.get("succeeded")).size());
        assertEquals(1, ((List<?>) result.get("failed")).size());
        assertEquals("配置同步失败: 仅 DRAFT/OFFLINE 状态可发布",
                ((Map<?, ?>) ((List<?>) result.get("failed")).get(0)).get("reason"));
    }

    @Test
    void bulkDeleteRequiresIds() {
        assertThrows(BusinessException.class,
                () -> controller.bulkDelete(new RouteController.BulkIdsRequest(List.of())));
    }

    @Test
    void bulkOffline() {
        doNothing().when(routeService).offlineRoute(5L);
        Map<String, Object> result = controller.bulkOffline(new RouteController.BulkIdsRequest(List.of(5L)));
        assertEquals(1, ((List<?>) result.get("succeeded")).size());
        verify(routeService).offlineRoute(5L);
    }

    @Test
    void createImportSnapshot() {
        // T2：导入快照
        when(importSnapshotService.createSnapshot())
                .thenReturn(Map.of("snapshot_id", 1L, "route_count", 3));
        Map<String, Object> result = controller.createImportSnapshot();
        assertEquals(3, result.get("route_count"));
        verify(importSnapshotService).createSnapshot();
    }

    @Test
    void rollbackImport() {
        // T2：按快照回滚
        when(importSnapshotService.rollback(1L)).thenReturn(Map.of("restored", 3));
        Map<String, Object> result = controller.rollbackImport(new RouteController.RollbackRequest(1L));
        assertEquals(3, result.get("restored"));
        verify(importSnapshotService).rollback(1L);
    }
}
