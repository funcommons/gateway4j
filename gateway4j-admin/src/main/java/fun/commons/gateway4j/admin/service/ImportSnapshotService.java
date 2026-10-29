package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.ImportSnapshotMapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.admin.mapper.RouteCanvasMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.ImportSnapshot;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 导入快照与回滚（阶段二 T2）。
 * <p>
 * POST /v1/routes/import/snapshot：把当前全量路由（含 conditions/bindings/tags）
 * 序列化存入 gw_import_snapshot；POST /v1/routes/import/rollback：事务内物理清空
 * 当前路由数据（路由/条件/绑定/画布级联）后按快照恢复。
 * 快照为自包含 JSON：路由引用父路由/条件目标用 route_name（不依赖雪花 ID），
 * 绑定用 plugin_id（数值主键），可完整还原 route+condition+binding 及状态。
 */
@Service
public class ImportSnapshotService {

    private final ImportSnapshotMapper snapshotMapper;
    private final RouteService routeService;
    private final RouteMapper routeMapper;
    private final RouteConditionMapper conditionMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final RouteCanvasMapper canvasMapper;
    private final PluginMapper pluginMapper;
    private final ApplicationEventPublisher eventPublisher;

    public ImportSnapshotService(ImportSnapshotMapper snapshotMapper,
                                 RouteService routeService,
                                 RouteMapper routeMapper,
                                 RouteConditionMapper conditionMapper,
                                 RoutePluginBindingMapper bindingMapper,
                                 RouteCanvasMapper canvasMapper,
                                 PluginMapper pluginMapper,
                                 ApplicationEventPublisher eventPublisher) {
        this.snapshotMapper = snapshotMapper;
        this.routeService = routeService;
        this.routeMapper = routeMapper;
        this.conditionMapper = conditionMapper;
        this.bindingMapper = bindingMapper;
        this.canvasMapper = canvasMapper;
        this.pluginMapper = pluginMapper;
        this.eventPublisher = eventPublisher;
    }

    // ==================== 快照 JSON 结构（内部格式，JsonUtils 序列化） ====================

    public record SnapshotPackage(String version, Long exportedAt, List<SnapshotRoute> routes) {}

    public record SnapshotRoute(String routeName, String routeType, String path, String upstreamUrl,
                                String status, Integer sortOrder, String remark, String tags,
                                String parentRouteName,
                                List<SnapshotCondition> conditions,
                                List<SnapshotBinding> bindings) {}

    public record SnapshotCondition(String conditionType, String operator, String conditionKey,
                                    String conditionValue, String targetRouteName, Integer priority) {}

    public record SnapshotBinding(Long pluginId, String bindingConfig, Integer sortOrder) {}

    // ==================== 快照 ====================

    @Transactional
    public Map<String, Object> createSnapshot() {
        List<Route> routes = routeService.listRoutes(null, null, null);
        Map<Long, String> nameById = new HashMap<>();
        for (Route r : routes) {
            nameById.put(r.getId(), r.getRouteName());
        }

        Map<Long, List<RouteCondition>> condByRoute = new HashMap<>();
        for (RouteCondition c : conditionMapper.selectList(null)) {
            condByRoute.computeIfAbsent(c.getRouteId(), k -> new ArrayList<>()).add(c);
        }
        Map<Long, List<RoutePluginBinding>> bindByRoute = new HashMap<>();
        for (RoutePluginBinding b : bindingMapper.selectList(null)) {
            bindByRoute.computeIfAbsent(b.getRouteId(), k -> new ArrayList<>()).add(b);
        }

        List<SnapshotRoute> nodes = new ArrayList<>();
        for (Route r : routes) {
            List<SnapshotCondition> conds = new ArrayList<>();
            for (RouteCondition c : condByRoute.getOrDefault(r.getId(), List.of())) {
                conds.add(new SnapshotCondition(c.getConditionType(), c.getOperator(),
                        c.getConditionKey(), c.getConditionValue(),
                        nameById.get(c.getTargetRouteId()), c.getPriority()));
            }
            List<SnapshotBinding> binds = new ArrayList<>();
            for (RoutePluginBinding b : bindByRoute.getOrDefault(r.getId(), List.of())) {
                binds.add(new SnapshotBinding(b.getPluginId(), b.getBindingConfig(), b.getSortOrder()));
            }
            nodes.add(new SnapshotRoute(r.getRouteName(), r.getRouteType(), r.getPath(),
                    r.getUpstreamUrl(), r.getStatus(), r.getSortOrder(), r.getRemark(),
                    r.getTags(), r.getParentRouteId() != null ? nameById.get(r.getParentRouteId()) : null,
                    conds, binds));
        }

        SnapshotPackage pkg = new SnapshotPackage("1.0", System.currentTimeMillis(), nodes);
        ImportSnapshot snapshot = ImportSnapshot.builder()
                .snapshotData(JsonUtils.toCompactJson(pkg))
                .routeCount(routes.size())
                .build();
        snapshotMapper.insert(snapshot);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("snapshot_id", snapshot.getId());
        result.put("route_count", routes.size());
        return result;
    }

    // ==================== 回滚 ====================

    @Transactional
    public Map<String, Object> rollback(Long snapshotId) {
        ImportSnapshot snapshot = snapshotMapper.selectById(snapshotId);
        if (snapshot == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "快照不存在: " + snapshotId);
        }
        SnapshotPackage pkg;
        try {
            pkg = JsonUtils.parseObject(snapshot.getSnapshotData(), SnapshotPackage.class);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "快照数据损坏: " + e.getMessage());
        }
        List<SnapshotRoute> all = pkg != null && pkg.routes() != null ? pkg.routes() : List.of();

        // 级联清空当前路由数据（物理删除：逻辑删除会让 route_name 唯一索引外的
        // 历史数据堆积，且回滚语义即“恢复到快照时点”）
        bindingMapper.deleteAllHard();
        conditionMapper.deleteAllHard();
        canvasMapper.deleteAllHard();
        routeMapper.deleteAllHard();

        // 恢复路由主体：父路由先建；悬空父引用兜底置空，保证有限轮收敛
        Map<String, Long> idByName = new HashMap<>();
        List<SnapshotRoute> pending = new ArrayList<>(all);
        int restored = 0;
        while (!pending.isEmpty()) {
            boolean progressed = false;
            Iterator<SnapshotRoute> it = pending.iterator();
            while (it.hasNext()) {
                SnapshotRoute sr = it.next();
                Long parentRouteId = null;
                if (sr.parentRouteName() != null) {
                    parentRouteId = idByName.get(sr.parentRouteName());
                    if (parentRouteId == null) {
                        continue; // 父路由尚未恢复，下一轮再处理
                    }
                }
                Long id = insertRoute(sr, parentRouteId);
                idByName.put(sr.routeName(), id);
                it.remove();
                progressed = true;
                restored++;
            }
            if (!progressed) {
                // 剩余路由父链断裂（快照内父路由缺失）：按顶级路由兜底恢复
                SnapshotRoute orphan = pending.remove(0);
                Long id = insertRoute(orphan, null);
                idByName.put(orphan.routeName(), id);
                restored++;
            }
        }

        // 恢复条件 + 绑定
        Map<Long, Plugin> pluginById = new HashMap<>();
        List<Long> pluginIds = all.stream()
                .filter(sr -> sr.bindings() != null)
                .flatMap(sr -> sr.bindings().stream())
                .map(SnapshotBinding::pluginId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (!pluginIds.isEmpty()) {
            for (Plugin p : pluginMapper.selectByIds(pluginIds)) {
                pluginById.put(p.getId(), p);
            }
        }
        for (SnapshotRoute sr : all) {
            Long routeId = idByName.get(sr.routeName());
            if (routeId == null) {
                continue;
            }
            if (sr.conditions() != null) {
                for (SnapshotCondition c : sr.conditions()) {
                    Long targetId = c.targetRouteName() != null
                            ? idByName.get(c.targetRouteName()) : null;
                    if (targetId == null) {
                        continue; // 目标路由缺失（如悬空引用被置空），条件无法挂接
                    }
                    conditionMapper.insert(RouteCondition.builder()
                            .routeId(routeId)
                            .targetRouteId(targetId)
                            .conditionType(c.conditionType() != null ? c.conditionType() : "PATH")
                            .operator(c.operator() != null ? c.operator() : "EQ")
                            .conditionKey(c.conditionKey())
                            .conditionValue(c.conditionValue())
                            .priority(c.priority() != null ? c.priority() : 0)
                            .build());
                }
            }
            if (sr.bindings() != null) {
                for (SnapshotBinding b : sr.bindings()) {
                    if (b.pluginId() == null || !pluginById.containsKey(b.pluginId())) {
                        continue; // 插件已不存在，绑定无法恢复
                    }
                    bindingMapper.insert(RoutePluginBinding.builder()
                            .routeId(routeId)
                            .pluginId(b.pluginId())
                            .sortOrder(b.sortOrder() != null ? b.sortOrder() : 0)
                            .bindingConfig(b.bindingConfig() != null ? b.bindingConfig() : "{}")
                            .build());
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("restored", restored);
        return result;
    }

    private Long insertRoute(SnapshotRoute sr, Long parentRouteId) {
        Route route = Route.builder()
                .routeName(sr.routeName())
                .routeType(sr.routeType() != null ? sr.routeType() : "BACKEND")
                .path(sr.path())
                .upstreamUrl(sr.upstreamUrl())
                .status(sr.status() != null ? sr.status() : "DRAFT")
                .parentRouteId(parentRouteId)
                .sortOrder(sr.sortOrder() != null ? sr.sortOrder() : 0)
                .remark(sr.remark())
                .tags(sr.tags())
                .build();
        routeService.save(route);
        eventPublisher.publishEvent(new ConfigChangeEvent(this, "ROUTE", route.getId(),
                route.getConfigVersion(), "CREATE"));
        return route.getId();
    }
}
