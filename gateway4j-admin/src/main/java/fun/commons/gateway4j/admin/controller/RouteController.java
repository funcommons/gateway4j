package fun.commons.gateway4j.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.framework4j.ratelimit.annotation.RateLimit;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.ConfigSyncStatusService;
import fun.commons.gateway4j.admin.service.ImportSnapshotService;
import fun.commons.gateway4j.admin.service.RouteBindingService;
import fun.commons.gateway4j.admin.service.RouteEnvironmentDiffService;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService;
import fun.commons.gateway4j.admin.service.RouteCanvasService;
import fun.commons.gateway4j.admin.service.RoutePackage;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import fun.commons.gateway4j.admin.service.RouteVersionService;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCanvas;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.model.RouteVersion;
import fun.commons.gateway4j.admin.validation.ValidBackendRouteCreate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final RouteEnvironmentDiffService routeEnvironmentDiffService;
    private final RouteVersionService routeVersionService;
    private final ConfigSyncStatusService configSyncStatusService;

    @Autowired
    public RouteController(RouteService routeService, RouteCanvasService routeCanvasService,
                           RouteCanvasApplyService routeCanvasApplyService,
                           RouteBindingService routeBindingService,
                           RouteTransferService routeTransferService,
                           ImportSnapshotService importSnapshotService,
                           RouteEnvironmentDiffService routeEnvironmentDiffService,
                           RouteVersionService routeVersionService,
                           ConfigSyncStatusService configSyncStatusService) {
        this.routeService = routeService;
        this.routeCanvasService = routeCanvasService;
        this.routeCanvasApplyService = routeCanvasApplyService;
        this.routeBindingService = routeBindingService;
        this.routeTransferService = routeTransferService;
        this.importSnapshotService = importSnapshotService;
        this.routeEnvironmentDiffService = routeEnvironmentDiffService;
        this.routeVersionService = routeVersionService;
        this.configSyncStatusService = configSyncStatusService;
    }

    /** 旧 8 参构造（存量调用方兼容，同 ImportRequest/BulkIdsRequest 旧参构造风格）：同步状态服务缺省 null。 */
    public RouteController(RouteService routeService, RouteCanvasService routeCanvasService,
                           RouteCanvasApplyService routeCanvasApplyService,
                           RouteBindingService routeBindingService,
                           RouteTransferService routeTransferService,
                           ImportSnapshotService importSnapshotService,
                           RouteEnvironmentDiffService routeEnvironmentDiffService,
                           RouteVersionService routeVersionService) {
        this(routeService, routeCanvasService, routeCanvasApplyService, routeBindingService,
                routeTransferService, importSnapshotService, routeEnvironmentDiffService,
                routeVersionService, null);
    }

    @GetMapping
    public List<Map<String, Object>> listRoutes(@RequestParam(name = "route_type", required = false) String routeType,
                                                @RequestParam(required = false) String status,
                                                @RequestParam(required = false) String keyword,
                                                @RequestParam(required = false) String tag,
                                                @RequestParam(required = false) String environment) {
        return routeService.listRouteTree(routeType, status, keyword, tag, environment);
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

    /**
     * OPT-6：per-route 同步状态 = 全局网关水位（{@link ConfigSyncStatusService#readSyncStatus()}）
     * + 该路由行 config_version 现值。in_sync 沿用全局口径不做 per-route 版本比较
     * （route_config_version 是「该行上次发布时的版本」，与全局水位天然不等，
     * 任一路由发布即抬全局版本——OPT-6 裁决）。
     */
    @GetMapping("/{id}/sync-status")
    public ApiResponse<Map<String, Object>> routeSyncStatus(@PathVariable Long id) {
        Route route = routeService.getById(id);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        Map<String, Object> status = configSyncStatusService.readSyncStatus();
        // gateway 可为 null（available=false 降级）→ LinkedHashMap 拼装（Map.of 拒 null value）
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("route_id", id);
        data.put("route_config_version", route.getConfigVersion());
        data.putAll(status);
        return ApiResponse.success(data);
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
                // P2-2 多环境：可选 environment，缺省由 RouteService 归一为 default
                .environment(request.environment())
                .build();
        return routeService.createRouteWithBindings(route, request.conditions(),
                toBindings(request.bindings(), request.pluginIds()));
    }

    @PatchMapping("/{id}")
    @Auditable(action = "UPDATE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route updateRoute(@PathVariable Long id, @Valid @RequestBody RouteUpdateRequest request) {
        // P1-5 乐观锁：expected_version 可缺省（不校验，兼容旧调用）；携带且 ≠ 当前
        // config_version → 10402（与 ApiCode.STATE_CONFLICT 同码，语义即状态冲突）。
        // 画布「应用到路由树」（/canvas/apply）走 diff 流、天然并发安全，豁免不校验。
        if (request.expectedVersion() != null) {
            Route current = routeService.getById(id);
            if (current != null) {
                long currentVersion = current.getConfigVersion() != null ? current.getConfigVersion() : 0L;
                if (request.expectedVersion() != currentVersion) {
                    throw new BusinessException(ErrorCode.ROUTE_VERSION_CONFLICT);
                }
            }
        }
        Route route = new Route();
        route.setId(id);
        // T1 修复（H7a 发现的既有隐蔽缺陷）：先抵消 Lombok @Builder.Default 在
        // new Route() 时注入的默认值（status=DRAFT、sort_order=0、tags=""、
        // config_version=0、environment=default），让「null = 请求未携带」语义成立
        // ——否则 PATCH 只改备注会把 OFFLINE 路由静默重置为 DRAFT，并把
        // sort_order/tags/config_version 踩成默认值。服务层再做白名单拷贝兜底。
        route.setStatus(null);
        route.setSortOrder(null);
        route.setTags(null);
        route.setConfigVersion(null);
        if (request.routeName() != null) route.setRouteName(request.routeName());
        if (request.path() != null) route.setPath(request.path());
        if (request.upstreamUrl() != null) route.setUpstreamUrl(request.upstreamUrl());
        if (request.parentRouteId() != null) route.setParentRouteId(request.parentRouteId());
        if (request.sortOrder() != null) route.setSortOrder(request.sortOrder());
        if (request.remark() != null) route.setRemark(request.remark());
        if (request.tags() != null) route.setTags(request.tags());
        // P2-2 多环境：不携带 environment = 维持既有环境不变。必须显式置 null——
        // Route 的 @Builder.Default 字段在 new Route() 时已带 "default"，不置 null
        // 会让 updateById 把既有环境踩回 default（MyBatis-Plus 只跳过 null 字段）。
        route.setEnvironment(request.environment());
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
    public Route publishRoute(@PathVariable Long id,
                              @RequestBody(required = false) PublishRequest request) {
        // P2-4 流程档轻量：可选 change_description 随方法参数被 framework4j-audit
        // 切面（logArgs 默认 true）序列化进审计行 args_json——审计 action 仍为
        // PUBLISH_ROUTE，不带 body 的旧调用完全兼容。
        // 契约 §4 S5a：change_description + actor 透传进发布事务，落版本快照。
        routeService.publishRoute(id,
                request != null ? request.changeDescription() : null,
                resolveActor());
        return routeService.getById(id);
    }

    /** P2-5 环境间 diff：route_name 对齐，逐字段比对（见 RouteEnvironmentDiffService）。 */
    @GetMapping("/environment-diff")
    public Map<String, Object> environmentDiff(@RequestParam String from, @RequestParam String to) {
        return routeEnvironmentDiffService.diff(from, to);
    }

    @PostMapping("/{id}/offline")
    @Auditable(action = "OFFLINE_ROUTE", targetType = "ROUTE", targetIdSpel = "#id")
    public Route offlineRoute(@PathVariable Long id) {
        // 契约 §4 S5a：actor 透传进下线事务，落版本快照
        routeService.offlineRoute(id, resolveActor());
        return routeService.getById(id);
    }

    // ==================== 契约 §4 S5a：路由版本快照 ====================

    /** 版本时间线：某路由全部快照，config_version 倒序。 */
    @GetMapping("/{id}/versions")
    public ApiResponse<List<RouteVersion>> listVersions(@PathVariable Long id) {
        return ApiResponse.success(routeVersionService.listVersions(id));
    }

    /** 两版本逐字段 diff：平铺 {field, from, to}，未变字段不输出（字段集同 EnvDiff）。 */
    @GetMapping("/{id}/versions/diff")
    public ApiResponse<List<Map<String, Object>>> diffVersions(@PathVariable Long id,
                                                               @RequestParam Long from,
                                                               @RequestParam Long to) {
        return ApiResponse.success(routeVersionService.diff(id, from, to));
    }

    /** 从现有身份设施取登录名；开放 API/系统内部调用等无登录态时归 system。 */
    private String resolveActor() {
        try {
            Object username = TokenContext.getClaim("username");
            return username != null && !String.valueOf(username).isBlank()
                    ? String.valueOf(username) : "system";
        } catch (Exception e) {
            return "system";
        }
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
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> createImportSnapshot() {
        return importSnapshotService.createSnapshot();
    }

    /** 事务内清空当前路由数据并按快照恢复，返回 {restored:N}。 */
    @PostMapping("/import/rollback")
    @Auditable(action = "ROLLBACK_IMPORT_SNAPSHOT", targetType = "ROUTE")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
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

    /** 批量发布（逐个执行单条逻辑：仅 DRAFT/OFFLINE 可发布），返回 {succeeded, failed}；
     * 请求体 change_description 透传至各路由发布快照（缺省 null）。 */
    @PostMapping("/bulk-publish")
    @Auditable(action = "BULK_PUBLISH_ROUTES", targetType = "ROUTE")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> bulkPublish(@RequestBody BulkIdsRequest request) {
        return bulkExecute(request.ids(),
                id -> routeService.publishRoute(id, request.changeDescription(), "system"));
    }

    /** 批量下线（仅 PUBLISHED 可下线）。 */
    @PostMapping("/bulk-offline")
    @Auditable(action = "BULK_OFFLINE_ROUTES", targetType = "ROUTE")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> bulkOffline(@RequestBody BulkIdsRequest request) {
        return bulkExecute(request.ids(), routeService::offlineRoute);
    }

    /** 批量删除（PUBLISHED 不可删、被引用不可删——同单条逻辑，失败记入 failed）。 */
    @PostMapping("/bulk-delete")
    @Auditable(action = "BULK_DELETE_ROUTES", targetType = "ROUTE")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
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
    public RoutePackage exportRoutes(@RequestParam(name = "route_ids", required = false) List<Long> routeIds,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String environment) {
        return routeTransferService.exportRoutes(routeIds, status, environment);
    }

    @PostMapping("/import")
    @Auditable(action = "IMPORT_ROUTES", targetType = "ROUTE")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> importRoutes(@RequestBody ImportRequest request) {
        return routeTransferService.importRoutes(request.data(), request.strategy(), request.targetEnvironment());
    }

    @PostMapping("/import/validate")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> validateImport(@RequestBody RoutePackage data,
                                              @RequestParam(required = false) String environment) {
        return routeTransferService.validateImport(data, environment);
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
            @Pattern(regexp = "^[a-z0-9_-]{1,20}$", message = "环境标识须为 1-20 位小写字母、数字、下划线或中划线")
            String environment,
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
            @Pattern(regexp = "^[a-z0-9_-]{1,20}$", message = "环境标识须为 1-20 位小写字母、数字、下划线或中划线")
            String environment,
            List<RouteCondition> conditions,
            List<Long> pluginIds,
            List<BindingRequest> bindings,
            /** P1-5 乐观锁：可缺省 = 不校验；携带且 ≠ 当前 config_version → 10402。 */
            Long expectedVersion
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

    /** P2-2 多环境：target_environment 可选（缺省 default）；旧包（无 environment 字段）同样落 default。 */
    public record ImportRequest(RoutePackage data, String strategy, String targetEnvironment) {
        /** 旧两参构造（存量调用方兼容）。 */
        public ImportRequest(RoutePackage data, String strategy) {
            this(data, strategy, null);
        }
    }

    /** 阶段二 T2：回滚请求。 */
    public record RollbackRequest(Long snapshotId) {}

    /**
     * 阶段二 T3：批量操作请求（ids 为路由 id 数组）。
     * P2-4 流程档轻量：可选 change_description 随请求进入审计行 args_json
     * （action=BULK_PUBLISH_ROUTES），缺省兼容旧调用。
     */
    public record BulkIdsRequest(List<Long> ids, String changeDescription) {
        /** 旧单参构造（存量调用方兼容）。 */
        public BulkIdsRequest(List<Long> ids) {
            this(ids, null);
        }
    }

    /** P2-4 流程档轻量：发布变更说明（可选——UI 侧必填，API 侧可选，兼容旧调用）。 */
    public record PublishRequest(String changeDescription) {}
}
