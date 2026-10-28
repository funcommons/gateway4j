package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 画布「应用到路由树」（POST /v1/routes/{id}/canvas/apply）。
 * <p>
 * 从画布 nodes（type=BACKEND）反推子路由：节点 id 为既有路由 id → 更新
 * path/upstream_url/parent_route_id；非既有（如 n_xxx）→ 新建 DRAFT 子路由
 * （route_name 从 label 派生并按 ^[a-zA-Z0-9_]{2,50}$ 规整，冲突追加 _N 后缀）。
 * 从 edges 反推分发条件（全量替换该父路由下 gw_route_condition）。
 * 画布上不存在但 DB 中是该父路由既有子路由 → 进入 to_delete，
 * 仅 confirm_delete_ids 命中的才真删。dry_run=true 只算 diff 不写库。
 */
@Service
public class RouteCanvasApplyService {

    private final RouteService routeService;
    private final RouteConditionMapper conditionMapper;

    public RouteCanvasApplyService(RouteService routeService, RouteConditionMapper conditionMapper) {
        this.routeService = routeService;
        this.conditionMapper = conditionMapper;
    }

    // ==================== 请求 DTO（字段名与全局 Jackson snake_case 对齐） ====================

    public record CanvasApplyRequest(
            List<CanvasNodeDto> nodes,
            List<CanvasEdgeDto> edges,
            Boolean dryRun,
            List<Long> confirmDeleteIds
    ) {}

    public record CanvasNodeDto(String id, String type, CanvasNodeDataDto data) {}

    public record CanvasNodeDataDto(String label, String path, String upstreamUrl) {}

    public record CanvasEdgeDto(String id, String source, String target, CanvasEdgeDataDto data) {}

    public record CanvasEdgeDataDto(String conditionType, String conditionKey,
                                    String conditionValue, String operator, Integer priority) {}

    private record ChildPlan(CanvasNodeDto node, Route existing, Map<String, Object> changes,
                             String newRouteName) {}

    /** 条件在新建子路由执行前 target 未知，暂存画布节点 id，执行阶段回填。 */
    private record PendingCondition(RouteCondition condition, String targetNodeId, String edgeId) {}

    // ==================== 主流程 ====================

    @Transactional
    public Map<String, Object> applyCanvas(Long parentId, CanvasApplyRequest request) {
        Route parent = routeService.getById(parentId);
        if (parent == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        if (!"DISPATCH".equals(parent.getRouteType())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "父路由必须是分发路由（DISPATCH）");
        }
        if ("PUBLISHED".equals(parent.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "已发布路由不可直接修改，请先下线");
        }
        List<CanvasNodeDto> nodes = request.nodes() != null ? request.nodes() : List.of();
        List<CanvasEdgeDto> edges = request.edges() != null ? request.edges() : List.of();

        // 父路由既有子路由
        List<Route> existingChildren = routeService.list(new LambdaQueryWrapper<Route>()
                .eq(Route::getParentRouteId, parentId));
        Map<Long, Route> childById = new HashMap<>();
        for (Route child : existingChildren) {
            childById.put(child.getId(), child);
        }
        // 画布上出现的路由 id，用于 to_delete 判定（画布无 → 候删）
        Set<Long> canvasRouteIds = new HashSet<>();

        // ---- 1. 反推子路由（create / update 计划） ----
        List<ChildPlan> createPlans = new ArrayList<>();
        List<ChildPlan> updatePlans = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        Set<String> usedNames = collectUsedNames();
        // 画布节点 id → 路由 id（既有直接命中；新建的在执行阶段回填）
        Map<String, Long> nodeRouteId = new HashMap<>();

        for (CanvasNodeDto node : nodes) {
            if (!"BACKEND".equals(node.type()) || node.id() == null) {
                continue;
            }
            Long existingId = parseRouteId(node.id());
            if (existingId != null && existingId.equals(parentId)) {
                errors.add(Map.of("node_id", node.id(), "message", "节点不能指向父路由自身"));
                continue;
            }
            Route child = null;
            if (existingId != null) {
                child = childById.containsKey(existingId)
                        ? childById.get(existingId)
                        : routeService.getById(existingId);
            }
            if (child != null) {
                canvasRouteIds.add(child.getId());
                nodeRouteId.put(node.id(), child.getId());
                updatePlans.add(new ChildPlan(node, child, diffChild(child, node), null));
            } else {
                String name = uniqueName(deriveName(node), usedNames);
                createPlans.add(new ChildPlan(node, null, null, name));
            }
        }

        // ---- 2. to_delete：DB 有、画布无 ----
        List<Map<String, Object>> toDelete = new ArrayList<>();
        for (Route child : existingChildren) {
            if (!canvasRouteIds.contains(child.getId())) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", String.valueOf(child.getId()));
                item.put("name", child.getRouteName());
                toDelete.add(item);
            }
        }

        // ---- 3. edges → 分发条件（新建子路由的 target 执行阶段回填） ----
        List<PendingCondition> pendingConditions =
                buildConditions(parentId, edges, nodeRouteId);

        // ---- 4. 组装 diff 报告 ----
        List<Map<String, Object>> toCreate = new ArrayList<>();
        for (ChildPlan plan : createPlans) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", labelOf(plan.node()));
            item.put("path", pathOf(plan.node()));
            item.put("upstream_url", upstreamOf(plan.node()));
            item.put("route_name", plan.newRouteName());
            toCreate.add(item);
        }
        List<Map<String, Object>> toUpdate = new ArrayList<>();
        for (ChildPlan plan : updatePlans) {
            if (plan.changes().isEmpty()) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", String.valueOf(plan.existing().getId()));
            item.put("changes", plan.changes());
            toUpdate.add(item);
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("to_create", toCreate);
        report.put("to_update", toUpdate);
        report.put("to_delete", toDelete);
        report.put("conditions_changes", pendingConditions.size());

        boolean dryRun = request.dryRun() == null || request.dryRun();
        if (dryRun) {
            report.put("dry_run", true);
            return report;
        }

        // ---- 5. 执行：先建/改子路由 → 全量替换条件 → 删除（顺序保证旧条件不阻塞删除） ----
        List<Object> createdIds = new ArrayList<>();
        List<Object> updatedIds = new ArrayList<>();
        List<Object> deletedIds = new ArrayList<>();

        for (ChildPlan plan : createPlans) {
            Route route = Route.builder()
                    .routeName(plan.newRouteName())
                    .routeType("BACKEND")
                    .path(pathOf(plan.node()))
                    .upstreamUrl(upstreamOf(plan.node()))
                    .parentRouteId(parentId)
                    .status("DRAFT")
                    .sortOrder(createdIds.size() + 1)
                    .build();
            routeService.save(route);
            createdIds.add(String.valueOf(route.getId()));
            nodeRouteId.put(plan.node().id(), route.getId());
        }
        for (ChildPlan plan : updatePlans) {
            Route child = plan.existing();
            CanvasNodeDataDto data = plan.node().data();
            boolean changed = false;
            if (data != null) {
                if (data.path() != null && !data.path().equals(child.getPath())) {
                    child.setPath(data.path());
                    changed = true;
                }
                if (data.upstreamUrl() != null && !data.upstreamUrl().equals(child.getUpstreamUrl())) {
                    child.setUpstreamUrl(data.upstreamUrl());
                    changed = true;
                }
            }
            if (!parentId.equals(child.getParentRouteId())) {
                child.setParentRouteId(parentId);
                changed = true;
            }
            if (changed) {
                routeService.updateById(child);
                updatedIds.add(String.valueOf(child.getId()));
            }
        }

        // 全量替换该父路由下的分发条件
        conditionMapper.delete(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getRouteId, parentId));
        int insertedConditions = 0;
        for (PendingCondition pending : pendingConditions) {
            RouteCondition cond = pending.condition();
            if (cond.getTargetRouteId() == null) {
                Long resolved = pending.targetNodeId() != null
                        ? nodeRouteId.get(pending.targetNodeId()) : null;
                if (resolved == null) {
                    errors.add(Map.of("edge", pending.edgeId() != null ? pending.edgeId() : "",
                            "message", "条件目标节点不在画布中，已忽略"));
                    continue;
                }
                cond.setTargetRouteId(resolved);
            }
            conditionMapper.insert(cond);
            insertedConditions++;
        }
        report.put("conditions_changes", insertedConditions);

        // 只有 confirm_delete_ids 命中的才真删
        Set<Long> confirmed = request.confirmDeleteIds() != null
                ? new HashSet<>(request.confirmDeleteIds()) : Set.of();
        for (Map<String, Object> item : toDelete) {
            Long id = Long.valueOf(String.valueOf(item.get("id")));
            if (!confirmed.contains(id)) {
                continue;
            }
            try {
                routeService.deleteRoute(id);
                deletedIds.add(String.valueOf(id));
            } catch (BusinessException e) {
                errors.add(Map.of("id", String.valueOf(id),
                        "message", e.getMessage() != null ? e.getMessage() : "删除失败"));
            }
        }

        report.put("dry_run", false);
        report.put("created_ids", createdIds);
        report.put("updated_ids", updatedIds);
        report.put("deleted_ids", deletedIds);
        report.put("errors", errors);
        return report;
    }

    // ==================== 内部工具 ====================

    /** edges → 该父路由下的分发条件集合；target 未知的（画布新建节点）暂存节点 id。 */
    private List<PendingCondition> buildConditions(Long parentId, List<CanvasEdgeDto> edges,
                                                   Map<String, Long> nodeRouteId) {
        List<PendingCondition> conditions = new ArrayList<>();
        int index = 1;
        for (CanvasEdgeDto edge : edges) {
            if (edge == null || edge.target() == null) {
                continue;
            }
            Long targetId = nodeRouteId.get(edge.target());
            if (targetId == null) {
                Long numeric = parseRouteId(edge.target());
                if (numeric != null && routeService.getById(numeric) != null) {
                    // 兜底：target 为画布外的既有路由 id
                    targetId = numeric;
                }
            }
            CanvasEdgeDataDto data = edge.data();
            RouteCondition cond = RouteCondition.builder()
                    .routeId(parentId)
                    .targetRouteId(targetId)
                    .conditionType(data != null && data.conditionType() != null
                            && !data.conditionType().isBlank() ? data.conditionType() : "PATH")
                    .operator(data != null && data.operator() != null
                            && !data.operator().isBlank() ? data.operator() : "EQ")
                    .conditionKey(data != null ? data.conditionKey() : null)
                    .conditionValue(data != null ? data.conditionValue() : null)
                    .priority(data != null && data.priority() != null ? data.priority() : index)
                    .build();
            conditions.add(new PendingCondition(cond, edge.target(), edge.id()));
            index++;
        }
        return conditions;
    }

    private Map<String, Object> diffChild(Route child, CanvasNodeDto node) {
        Map<String, Object> changes = new LinkedHashMap<>();
        CanvasNodeDataDto data = node.data();
        String path = data != null ? data.path() : null;
        String upstream = data != null ? data.upstreamUrl() : null;
        if (path != null && !path.equals(child.getPath())) {
            changes.put("path", Map.of("from", child.getPath(), "to", path));
        }
        if (upstream != null && !upstream.equals(child.getUpstreamUrl())) {
            changes.put("upstream_url", Map.of("from", child.getUpstreamUrl(), "to", upstream));
        }
        return changes;
    }

    private String labelOf(CanvasNodeDto node) {
        return node.data() != null && node.data().label() != null ? node.data().label() : node.id();
    }

    private String pathOf(CanvasNodeDto node) {
        return node.data() != null ? node.data().path() : null;
    }

    private String upstreamOf(CanvasNodeDto node) {
        return node.data() != null ? node.data().upstreamUrl() : null;
    }

    private Long parseRouteId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Set<String> collectUsedNames() {
        Set<String> used = new HashSet<>();
        for (Route r : routeService.list()) {
            used.add(r.getRouteName());
        }
        return used;
    }

    /** 从 label 派生 route_name：非法字符归整为 _，须可满足 ^[a-zA-Z0-9_]{2,50}$。 */
    private String deriveName(CanvasNodeDto node) {
        String base = sanitizeName(labelOf(node));
        if (base.length() < 2) {
            base = sanitizeName(node.id());
        }
        if (base.length() < 2) {
            base = "node";
        }
        return base;
    }

    private String sanitizeName(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.replaceAll("[^a-zA-Z0-9_]", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_+|_+$", "");
        if (s.length() > 50) {
            s = s.substring(0, 50).replaceAll("_+$", "");
        }
        return s;
    }

    /** 保证 route_name 全局唯一（uk_route_name），冲突时追加 _2/_3… 后缀并保持 ≤50。 */
    private String uniqueName(String base, Set<String> usedNames) {
        if (!usedNames.contains(base)) {
            usedNames.add(base);
            return base;
        }
        int i = 1;
        while (true) {
            i++;
            String suffix = "_" + i;
            String candidate = base.length() + suffix.length() <= 50
                    ? base + suffix
                    : base.substring(0, 50 - suffix.length()) + suffix;
            if (!usedNames.contains(candidate)) {
                usedNames.add(candidate);
                return candidate;
            }
        }
    }
}
