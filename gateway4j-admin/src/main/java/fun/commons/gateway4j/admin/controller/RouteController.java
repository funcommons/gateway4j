package fun.commons.gateway4j.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RoutePackage;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCanvas;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.admin.validation.ValidBackendRouteCreate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@RestController
@RequestMapping("/v1/routes")
@RequiresToken("BEARER")
public class RouteController {

    private final RouteService routeService;
    private final RouteCanvasService routeCanvasService;
    private final RouteCanvasApplyService routeCanvasApplyService;
    private final RouteBindingService routeBindingService;
    private final RouteTransferService routeTransferService;
    private final ImportSnapshotService importSnapshotService;

    public RouteController(RouteService routeService, RouteCanvasService routeCanvasService,
                           RouteCanvasApplyService routeCanvasApplyService,
                           RouteBindingService routeBindingService,
                           RouteTransferService routeTransferService,
                           ImportSnapshotService importSnapshotService) {
        this.routeService = routeService;
        this.routeCanvasService = routeCanvasService;
        this.routeCanvasApplyService = routeCanvasApplyService;
        this.routeBindingService = routeBindingService;
        this.routeTransferService = routeTransferService;
        this.importSnapshotService = importSnapshotService;
    }

    @GetMapping
    public List<Map<String, Object>> listRoutes(@RequestParam(required = false) String routeType,
                                                @RequestParam(required = false) String status,
                                                @RequestParam(required = false) String keyword,
                                                @RequestParam(required = false) String tag) {
        return routeService.listRouteTree(routeType, status, keyword, tag);
    }

    /** 路由详情（修复 D3：前端编辑回显依赖此接口）。 */
    @GetMapping("/{id}")
    public Route getRoute(@PathVariable Long id) {
        Route route = routeService.getById(id);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        return route;
    }

    @PostMapping
    @Auditable(action = "CREATE_ROUTE", targetType = "ROUTE")
    public Route createRoute(@Valid @RequestBody RouteCreateRequest request) {
        Route route = Route.builder()
                .routeName(request.routeName())
                .routeType(request.routeType())
                .path(request.path())
                .upstreamUrl(request.upstreamUrl())
                .parentRouteId(request.parentRouteId())
                .sortOrder(request.sortOrder() != null ? request.sortOrder() : 1)
                .remark(request.remark())
                .tags(request.tags() != null ? request.tags() : "")
                .build();
        return routeService.createRouteWithBindings(route, request.conditions(),
                toBindings(request.bindings(), request.pluginIds()));
    }

    @PatchMapping("/{id}")
    @Auditable(action = "UPDATE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route updateRoute(@PathVariable Long id, @Valid @RequestBody RouteUpdateRequest request) {
        Route route = new Route();
        route.setId(id);
        if (request.routeName() != null) route.setRouteName(request.routeName());
        if (request.path() != null) route.setPath(request.path());
        if (request.upstreamUrl() != null) route.setUpstreamUrl(request.upstreamUrl());
        if (request.parentRouteId() != null) route.setParentRouteId(request.parentRouteId());
        if (request.sortOrder() != null) route.setSortOrder(request.sortOrder());
        if (request.remark() != null) route.setRemark(request.remark());
        if (request.tags() != null) route.setTags(request.tags());
        routeService.updateRouteWithBindings(route, request.conditions(),
                toBindings(request.bindings(), request.pluginIds()));
        return routeService.getById(id);
    }

    private List<RouteService.BindingInput> toBindings(List<BindingRequest> bindings, List<Long> pluginIds) {
        if (bindings != null) {
            return bindings.stream()
                    .map(b -> new RouteService.BindingInput(b.pluginId(), b.bindingConfig()))
                    .toList();
        }
        if (pluginIds != null) {
            return pluginIds.stream()
                    .map(id -> new RouteService.BindingInput(id, "{}"))
                    .toList();
        }
        return null;
    }

    @DeleteMapping("/{id}")
    @Auditable(action = "DELETE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public void deleteRoute(@PathVariable Long id) {
        routeService.deleteRoute(id);
    }

    @PostMapping("/{id}/publish")
    @Auditable(action = "PUBLISH_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route publishRoute(@PathVariable Long id) {
        routeService.publishRoute(id);
        return routeService.getById(id);
    }

    @PostMapping("/{id}/offline")
    @Auditable(action = "OFFLINE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route offlineRoute(@PathVariable Long id) {
        routeService.offlineRoute(id);
        return routeService.getById(id);
    }

    @PostMapping("/validate")
    public Map<String, Object> validateRoute(@RequestBody RouteValidateRequest request) {
        try {
            routeService.validateRoute(request.routeId(), request.conditions());
            return Map.of("is_valid", true, "errors", List.of());
        } catch (CyclicReferenceException e) {
            return Map.of("is_valid", false, "errors", List.of(
                    Map.of("error_code", "CYCLIC_REFERENCE",
                            "message", e.getMessage(),
                            "route_id", request.routeId() != null ? String.valueOf(request.routeId()) : null)
            ));
        } catch (DepthExceededException e) {
            return Map.of("is_valid", false, "errors", List.of(
                    Map.of("error_code", "DEPTH_EXCEEDED",
                            "message", e.getMessage(),
                            "route_id", request.routeId() != null ? String.valueOf(request.routeId()) : null)
            ));
        }
    }

    @GetMapping("/{id}/canvas")
    public RouteCanvas getCanvas(@PathVariable Long id) {
        return routeCanvasService.getCanvas(id);
    }

    @PutMapping("/{id}/canvas")
    @Auditable(action = "SAVE_CANVAS", targetType = "ROUTE", targetIdSpel = "#id")
    public void saveCanvas(@PathVariable Long id, @RequestBody CanvasRequest request) {
        // 修复 D19：前端发送 {canvas_data: {nodes, edges}} 对象而非字符串
        routeCanvasService.saveCanvas(id,
                request.canvasData() != null ? request.canvasData().toString() : null);
    }

    // ==================== 阶段二 T1：画布「应用到路由树」 ====================

    /**
     * 从画布 nodes/edges 反推子路由与分发条件并落库。
     * dry_run=true 只返回 diff 报告；dry_run=false 事务执行并附执行结果。
     */
    @PostMapping("/{id}/canvas/apply")
    @Auditable(action = "APPLY_CANVAS", targetType = "ROUTE", targetIdSpel = "#id")
    public Map<String, Object> applyCanvas(@PathVariable Long id,
                                           @RequestBody RouteCanvasApplyService.CanvasApplyRequest request) {
        return routeCanvasApplyService.applyCanvas(id, request);
    }

    // ==================== 阶段二 T2：导入快照与回滚 ====================

    /** 把当前全量路由（含 conditions/bindings/tags）序列化存档，返回 {snapshot_id, route_count}。 */
    @PostMapping("/import/snapshot")
    @Auditable(action = "CREATE_IMPORT_SNAPSHOT", targetType = "ROUTE")
    public Map<String, Object> createImportSnapshot() {
        return importSnapshotService.createSnapshot();
    }

    /** 事务内清空当前路由数据并按快照恢复，返回 {restored:N}。 */
    @PostMapping("/import/rollback")
    @Auditable(action = "ROLLBACK_IMPORT_SNAPSHOT", targetType = "ROUTE")
    public Map<String, Object> rollbackImport(@RequestBody RollbackRequest request) {
        return importSnapshotService.rollback(request.snapshotId());
    }

    // ==================== 阶段二 T3：路由复制与批量操作 ====================

    /** 深复制（含 conditions/bindings/tags，不含画布）为新 DRAFT 路由，返回新实体。 */
    @PostMapping("/{id}/duplicate")
    @Auditable(action = "DUPLICATE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route duplicateRoute(@PathVariable Long id) {
        return routeService.duplicateRoute(id);
    }

    /** 批量发布（逐个执行单条逻辑：仅 DRAFT/OFFLINE 可发布），返回 {succeeded, failed}。 */
    @PostMapping("/bulk-publish")
    @Auditable(action = "BULK_PUBLISH_ROUTES", targetType = "ROUTE")
    public Map<String, Object> bulkPublish(@RequestBody BulkIdsRequest request) {
        return bulkExecute(request.ids(), routeService::publishRoute);
    }

    /** 批量下线（仅 PUBLISHED 可下线）。 */
    @PostMapping("/bulk-offline")
    @Auditable(action = "BULK_OFFLINE_ROUTES", targetType = "ROUTE")
    public Map<String, Object> bulkOffline(@RequestBody BulkIdsRequest request) {
        return bulkExecute(request.ids(), routeService::offlineRoute);
    }

    /** 批量删除（PUBLISHED 不可删、被引用不可删——同单条逻辑，失败记入 failed）。 */
    @PostMapping("/bulk-delete")
    @Auditable(action = "BULK_DELETE_ROUTES", targetType = "ROUTE")
    public Map<String, Object> bulkDelete(@RequestBody BulkIdsRequest request) {
        return bulkExecute(request.ids(), routeService::deleteRoute);
    }

    /** 逐个执行既有单条逻辑，单条失败不影响其余（部分成功语义）。 */
    private Map<String, Object> bulkExecute(List<Long> ids, Consumer<Long> action) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "ids 不能为空");
        }
        List<Map<String, Object>> succeeded = new ArrayList<>();
        List<Map<String, Object>> failed = new ArrayList<>();
        for (Long id : ids) {
            try {
                action.accept(id);
                Map<String, Object> ok = new LinkedHashMap<>();
                ok.put("id", id);
                succeeded.add(ok);
            } catch (BusinessException e) {
                Map<String, Object> bad = new LinkedHashMap<>();
                bad.put("id", id);
                bad.put("reason", e.getMessage() != null ? e.getMessage() : "操作失败");
                failed.add(bad);
            } catch (Exception e) {
                Map<String, Object> bad = new LinkedHashMap<>();
                bad.put("id", id);
                bad.put("reason", "操作失败");
                failed.add(bad);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("succeeded", succeeded);
        result.put("failed", failed);
        return result;
    }

    @PostMapping("/{id}/conditions")
    @Auditable(action = "ADD_CONDITION", targetType = "ROUTE", targetIdSpel = "#id")
    public RouteCondition addCondition(@PathVariable Long id, @RequestBody RouteCondition condition) {
        return routeService.addCondition(id, condition);
    }

    @PutMapping("/{id}/conditions/{condId}")
    @Auditable(action = "UPDATE_CONDITION", targetType = "ROUTE", targetIdSpel = "#id")
    public RouteCondition updateCondition(@PathVariable Long id, @PathVariable Long condId,
                                          @RequestBody RouteCondition patch) {
        return routeService.updateCondition(id, condId, patch);
    }

    @DeleteMapping("/{id}/conditions/{condId}")
    @Auditable(action = "DELETE_CONDITION", targetType = "ROUTE", targetIdSpel = "#id")
    public void deleteCondition(@PathVariable Long id, @PathVariable Long condId) {
        routeService.deleteCondition(id, condId);
    }

    @GetMapping("/{id}/children")
    public List<Route> listChildren(@PathVariable Long id) {
        return routeService.listChildren(id);
    }

    @PutMapping("/sort")
    @Auditable(action = "SORT_ROUTES", targetType = "ROUTE")
    public void sortRoutes(@RequestBody SortRoutesRequest request) {
        routeService.sortRoutes(request.routeIds());
    }

    @GetMapping("/{id}/plugins")
    public List<Map<String, Object>> listBindings(@PathVariable Long id) {
        return routeBindingService.listBindings(id);
    }

    @PostMapping("/{id}/plugins")
    @Auditable(action = "BIND_PLUGIN", targetType = "ROUTE", targetIdSpel = "#id")
    public RoutePluginBinding bindPlugin(@PathVariable Long id, @RequestBody BindPluginRequest request) {
        return routeBindingService.bindPlugin(id, request.pluginId(), request.bindingConfig());
    }

    @PutMapping("/{id}/plugins/{bindingId}")
    @Auditable(action = "UPDATE_BINDING", targetType = "ROUTE", targetIdSpel = "#id")
    public RoutePluginBinding updateBinding(@PathVariable Long id, @PathVariable Long bindingId,
                                            @RequestBody UpdateBindingRequest request) {
        return routeBindingService.updateBinding(id, bindingId, request.bindingConfig(), request.sortOrder());
    }

    @DeleteMapping("/{id}/plugins/{bindingId}")
    @Auditable(action = "UNBIND_PLUGIN", targetType = "ROUTE", targetIdSpel = "#id")
    public void unbindPlugin(@PathVariable Long id, @PathVariable Long bindingId) {
        routeBindingService.unbindPlugin(id, bindingId);
    }

    @PutMapping("/{id}/plugins/sort")
    @Auditable(action = "SORT_ROUTE_PLUGINS", targetType = "ROUTE", targetIdSpel = "#id")
    public void sortRoutePlugins(@PathVariable Long id, @RequestBody SortBindingsRequest request) {
        routeBindingService.sortBindings(id, request.pluginPhase(), request.bindingIds());
    }

    @GetMapping("/{id}/plugin-chain")
    public Map<String, Object> getPluginChain(@PathVariable Long id) {
        return routeBindingService.getPluginChain(id);
    }

    @GetMapping("/export")
    public RoutePackage exportRoutes(@RequestParam(required = false) List<Long> routeIds,
                                     @RequestParam(required = false) String status) {
        return routeTransferService.exportRoutes(routeIds, status);
    }

    @PostMapping("/import")
    @Auditable(action = "IMPORT_ROUTES", targetType = "ROUTE")
    public Map<String, Object> importRoutes(@RequestBody ImportRequest request) {
        return routeTransferService.importRoutes(request.data(), request.strategy());
    }

    @PostMapping("/import/validate")
    public Map<String, Object> validateImport(@RequestBody RoutePackage data) {
        return routeTransferService.validateImport(data);
    }

    @ValidBackendRouteCreate
    public record RouteCreateRequest(
            @NotBlank(message = "路由名称不能为空")
            @Pattern(regexp = "^[a-zA-Z0-9_]{2,50}$", message = "路由名称须为 2-50 位字母、数字或下划线")
            String routeName,
            @NotBlank(message = "路由类型不能为空")
            @Pattern(regexp = "^(DISPATCH|BACKEND)$", message = "路由类型仅支持 DISPATCH/BACKEND")
            String routeType,
            @Pattern(regexp = "^/\\S+$", message = "路径须以 / 开头且不含空白字符")
            String path,
            @Pattern(regexp = "^https?://\\S+$", message = "上游地址须为 http:// 或 https:// 开头的 URL")
            String upstreamUrl,
            Long parentRouteId,
            @Min(value = 1, message = "排序值最小为 1")
            @Max(value = 9999, message = "排序值最大为 9999")
            Integer sortOrder,
            @Size(max = 200, message = "备注最长 200 字符")
            String remark,
            @Size(max = 200, message = "标签最长 200 字符")
            String tags,
            List<RouteCondition> conditions,
            List<Long> pluginIds,
            List<BindingRequest> bindings
    ) {}

    public record RouteUpdateRequest(
            @Pattern(regexp = "^[a-zA-Z0-9_]{2,50}$", message = "路由名称须为 2-50 位字母、数字或下划线")
            String routeName,
            @Pattern(regexp = "^/\\S+$", message = "路径须以 / 开头且不含空白字符")
            String path,
            @Pattern(regexp = "^https?://\\S+$", message = "上游地址须为 http:// 或 https:// 开头的 URL")
            String upstreamUrl,
            Long parentRouteId,
            @Min(value = 1, message = "排序值最小为 1")
            @Max(value = 9999, message = "排序值最大为 9999")
            Integer sortOrder,
            @Size(max = 200, message = "备注最长 200 字符")
            String remark,
            @Size(max = 200, message = "标签最长 200 字符")
            String tags,
            List<RouteCondition> conditions,
            List<Long> pluginIds,
            List<BindingRequest> bindings
    ) {}

    public record BindingRequest(Long pluginId, String bindingConfig) {}

    public record RouteValidateRequest(
            Long routeId,
            List<RouteCondition> conditions
    ) {}

    /** 修复 D19：前端发送对象（{nodes, edges}），Jackson 直接绑定为 JsonNode。 */
    public record CanvasRequest(JsonNode canvasData) {}

    public record SortRoutesRequest(List<Long> routeIds) {}

    public record BindPluginRequest(Long pluginId, String bindingConfig) {}

    public record UpdateBindingRequest(String bindingConfig, Integer sortOrder) {}

    public record SortBindingsRequest(String pluginPhase, List<Long> bindingIds) {}

    public record ImportRequest(RoutePackage data, String strategy) {}

    /** 阶段二 T2：回滚请求。 */
    public record RollbackRequest(Long snapshotId) {}

    /** 阶段二 T3：批量操作请求（ids 为路由 id 数组）。 */
    public record BulkIdsRequest(List<Long> ids) {}
}
