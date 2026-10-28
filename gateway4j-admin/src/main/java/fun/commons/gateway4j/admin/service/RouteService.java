package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.mapper.RouteMapper;
import fun.commons.gateway4j.admin.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class RouteService extends ServiceImpl<RouteMapper, Route> {

    private final RouteConditionMapper conditionMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final RouteValidator routeValidator;
    private final PluginService pluginService;
    private final ApplicationEventPublisher eventPublisher;

    public RouteService(RouteConditionMapper conditionMapper,
                        RoutePluginBindingMapper bindingMapper,
                        RouteValidator routeValidator,
                        @Lazy PluginService pluginService,
                        ApplicationEventPublisher eventPublisher) {
        this.conditionMapper = conditionMapper;
        this.bindingMapper = bindingMapper;
        this.routeValidator = routeValidator;
        this.pluginService = pluginService;
        this.eventPublisher = eventPublisher;
    }

    private void publishRouteChange(Long routeId, Long version, String changeType) {
        eventPublisher.publishEvent(new ConfigChangeEvent(this, "ROUTE", routeId, version, changeType));
    }

    public List<Route> listRoutes(String routeType, String status, String keyword) {
        return listRoutes(routeType, status, keyword, null);
    }

    /**
     * 路由列表（阶段二 T4：tag 精确筛选——tags 为逗号分隔字符串，
     * 命中其中一项即返回，如 tags="prod,pay" 时 tag=prod 命中）。
     */
    public List<Route> listRoutes(String routeType, String status, String keyword, String tag) {
        LambdaQueryWrapper<Route> wrapper = new LambdaQueryWrapper<Route>()
                .orderByAsc(Route::getSortOrder);
        if (routeType != null) {
            wrapper.eq(Route::getRouteType, routeType);
        }
        if (status != null) {
            wrapper.eq(Route::getStatus, status);
        }
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.like(Route::getRouteName, keyword);
        }
        if (tag != null && !tag.isEmpty()) {
            // (',' || tags || ',') LIKE '%,tag,%' 实现逗号分隔项精确匹配；转义 LIKE 通配符
            wrapper.apply("(',' || tags || ',') LIKE {0}",
                    "%," + escapeLike(tag) + ",%");
        }
        return list(wrapper);
    }

    /**
     * Build a route tree: top-level routes (parent_route_id null) with nested
     * children, each node carrying its bound plugins summary.
     */
    public List<Map<String, Object>> listRouteTree(String routeType, String status, String keyword) {
        return listRouteTree(routeType, status, keyword, null);
    }

    /** 路由树（阶段二 T4：tag 精确筛选，节点附带 tags 字段）。 */
    public List<Map<String, Object>> listRouteTree(String routeType, String status, String keyword, String tag) {
        List<Route> all = listRoutes(routeType, status, keyword, tag);
        Map<Long, List<RoutePluginBinding>> bindingsByRoute = new HashMap<>();
        for (RoutePluginBinding b : bindingMapper.selectList(null)) {
            bindingsByRoute.computeIfAbsent(b.getRouteId(), k -> new ArrayList<>()).add(b);
        }
        Map<Long, Plugin> pluginMap = new HashMap<>();
        List<Long> pluginIds = bindingMapper.selectList(null).stream()
                .map(RoutePluginBinding::getPluginId).distinct().toList();
        if (!pluginIds.isEmpty()) {
            for (Plugin p : pluginService.listByIds(pluginIds)) {
                pluginMap.put(p.getId(), p);
            }
        }
        Map<Long, List<Route>> childrenMap = new HashMap<>();
        List<Route> roots = new ArrayList<>();
        for (Route r : all) {
            if (r.getParentRouteId() == null) {
                roots.add(r);
            } else {
                childrenMap.computeIfAbsent(r.getParentRouteId(), k -> new ArrayList<>()).add(r);
            }
        }
        List<Map<String, Object>> tree = new ArrayList<>();
        for (Route root : roots) {
            tree.add(toTreeNode(root, childrenMap, bindingsByRoute, pluginMap));
        }
        return tree;
    }

    private Map<String, Object> toTreeNode(Route route, Map<Long, List<Route>> childrenMap,
                                           Map<Long, List<RoutePluginBinding>> bindingsByRoute,
                                           Map<Long, Plugin> pluginMap) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", String.valueOf(route.getId()));
        node.put("route_name", route.getRouteName());
        node.put("route_type", route.getRouteType());
        node.put("path", route.getPath());
        node.put("upstream_url", route.getUpstreamUrl());
        node.put("status", route.getStatus());
        node.put("sort_order", route.getSortOrder());
        node.put("remark", route.getRemark());
        node.put("tags", route.getTags() != null ? route.getTags() : "");
        node.put("config_version", route.getConfigVersion() != null ? String.valueOf(route.getConfigVersion()) : "0");
        node.put("created_at", route.getCreatedAt() != null ? route.getCreatedAt().toInstant().toEpochMilli() : 0L);
        node.put("updated_at", route.getUpdatedAt() != null ? route.getUpdatedAt().toInstant().toEpochMilli() : 0L);

        List<Map<String, Object>> plugins = new ArrayList<>();
        for (RoutePluginBinding b : bindingsByRoute.getOrDefault(route.getId(), List.of())) {
            Plugin p = pluginMap.get(b.getPluginId());
            if (p != null) {
                Map<String, Object> ps = new LinkedHashMap<>();
                ps.put("plugin_id", String.valueOf(p.getId()));
                ps.put("plugin_name", p.getPluginName());
                ps.put("plugin_phase", p.getPluginPhase());
                ps.put("sort_order", b.getSortOrder());
                plugins.add(ps);
            }
        }
        node.put("plugins", plugins);

        List<Map<String, Object>> children = new ArrayList<>();
        for (Route child : childrenMap.getOrDefault(route.getId(), List.of())) {
            children.add(toTreeNode(child, childrenMap, bindingsByRoute, pluginMap));
        }
        node.put("children", children);
        return node;
    }

    public record BindingInput(Long pluginId, String bindingConfig) {}

    @Transactional
    public Route createRoute(Route route, List<RouteCondition> conditions, List<Long> pluginIds) {
        List<BindingInput> bindings = pluginIds == null ? null
                : pluginIds.stream().map(id -> new BindingInput(id, "{}")).toList();
        return createRouteWithBindings(route, conditions, bindings);
    }

    @Transactional
    public Route createRouteWithBindings(Route route, List<RouteCondition> conditions, List<BindingInput> bindings) {
        validateRequiredFields(route, conditions);
        save(route);
        if (conditions != null && !conditions.isEmpty()) {
            for (RouteCondition cond : conditions) {
                cond.setRouteId(route.getId());
                conditionMapper.insert(cond);
            }
            if ("DISPATCH".equals(route.getRouteType())) {
                validateNoCycle(route, conditions);
            }
        }
        if (bindings != null && !bindings.isEmpty()) {
            int order = 0;
            for (BindingInput bi : bindings) {
                RoutePluginBinding binding = RoutePluginBinding.builder()
                        .routeId(route.getId())
                        .pluginId(bi.pluginId())
                        .sortOrder(order++)
                        .bindingConfig(bi.bindingConfig() != null ? bi.bindingConfig() : "{}")
                        .build();
                bindingMapper.insert(binding);
            }
        }
        publishRouteChange(route.getId(), route.getConfigVersion(), "CREATE");
        return route;
    }

    @Transactional
    public void updateRoute(Route route, List<RouteCondition> conditions, List<Long> pluginIds) {
        List<BindingInput> bindings = pluginIds == null ? null
                : pluginIds.stream().map(id -> new BindingInput(id, "{}")).toList();
        updateRouteWithBindings(route, conditions, bindings);
    }

    @Transactional
    public void updateRouteWithBindings(Route route, List<RouteCondition> conditions, List<BindingInput> bindings) {
        Route existing = getById(route.getId());
        if (existing == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        if ("PUBLISHED".equals(existing.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "已发布路由不可直接修改，请先下线");
        }
        updateById(route);
        if (conditions != null) {
            conditionMapper.delete(new LambdaQueryWrapper<RouteCondition>()
                    .eq(RouteCondition::getRouteId, route.getId()));
            for (RouteCondition cond : conditions) {
                cond.setRouteId(route.getId());
                conditionMapper.insert(cond);
            }
            if ("DISPATCH".equals(existing.getRouteType())) {
                validateNoCycle(existing, conditions);
            }
        }
        if (bindings != null) {
            bindingMapper.delete(new LambdaQueryWrapper<RoutePluginBinding>()
                    .eq(RoutePluginBinding::getRouteId, route.getId()));
            int order = 0;
            for (BindingInput bi : bindings) {
                RoutePluginBinding binding = RoutePluginBinding.builder()
                        .routeId(route.getId())
                        .pluginId(bi.pluginId())
                        .sortOrder(order++)
                        .bindingConfig(bi.bindingConfig() != null ? bi.bindingConfig() : "{}")
                        .build();
                bindingMapper.insert(binding);
            }
        }
        publishRouteChange(route.getId(), existing.getConfigVersion(), "UPDATE");
    }

    @Transactional
    public void deleteRoute(Long routeId) {
        Route existing = getById(routeId);
        if (existing == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        if ("PUBLISHED".equals(existing.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "已发布路由不可删除，请先下线");
        }
        Long refCount = conditionMapper.selectCount(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getTargetRouteId, routeId));
        if (refCount > 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "该路由被其他分发路由引用，不可删除");
        }
        getBaseMapper().deleteById(routeId);
        conditionMapper.delete(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getRouteId, routeId));
        bindingMapper.delete(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId));
        publishRouteChange(routeId, existing.getConfigVersion(), "DELETE");
    }

    @Transactional
    public void publishRoute(Long routeId) {
        Route route = getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        if (!"DRAFT".equals(route.getStatus()) && !"OFFLINE".equals(route.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "仅 DRAFT/OFFLINE 状态可发布");
        }
        route.setStatus("PUBLISHED");
        route.setConfigVersion((route.getConfigVersion() != null ? route.getConfigVersion() : 0L) + 1);
        updateById(route);
        publishRouteChange(routeId, route.getConfigVersion(), "PUBLISH");
    }

    @Transactional
    public void offlineRoute(Long routeId) {
        Route route = getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        if (!"PUBLISHED".equals(route.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "仅 PUBLISHED 状态可下线");
        }
        route.setStatus("OFFLINE");
        route.setConfigVersion((route.getConfigVersion() != null ? route.getConfigVersion() : 0L) + 1);
        updateById(route);
        publishRouteChange(routeId, route.getConfigVersion(), "OFFLINE");
    }

    public void validateRoute(Long routeId, List<RouteCondition> conditions) {
        Route route = null;
        if (routeId != null) {
            route = getById(routeId);
            if (route == null) {
                throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
            }
        }
        validateNoCycle(route, conditions);
        if (route != null) {
            routeValidator.validateDepth(route.getId(), buildConditionMap(route, conditions));
        }
    }

    @Transactional
    public RouteCondition addCondition(Long routeId, RouteCondition condition) {
        Route route = getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        condition.setRouteId(routeId);
        conditionMapper.insert(condition);
        if ("DISPATCH".equals(route.getRouteType())) {
            validateNoCycle(route, List.of(condition));
        }
        return condition;
    }

    @Transactional
    public RouteCondition updateCondition(Long routeId, Long condId, RouteCondition patch) {
        RouteCondition existing = conditionMapper.selectById(condId);
        if (existing == null || !existing.getRouteId().equals(routeId)) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "条件不存在或不属于该路由");
        }
        if (patch.getConditionType() != null) existing.setConditionType(patch.getConditionType());
        if (patch.getOperator() != null) existing.setOperator(patch.getOperator());
        if (patch.getConditionKey() != null) existing.setConditionKey(patch.getConditionKey());
        if (patch.getConditionValue() != null) existing.setConditionValue(patch.getConditionValue());
        if (patch.getTargetRouteId() != null) existing.setTargetRouteId(patch.getTargetRouteId());
        if (patch.getPriority() != null) existing.setPriority(patch.getPriority());
        conditionMapper.updateById(existing);
        Route route = getById(routeId);
        if (route != null && "DISPATCH".equals(route.getRouteType())) {
            validateNoCycle(route, null);
        }
        return existing;
    }

    @Transactional
    public void deleteCondition(Long routeId, Long condId) {
        RouteCondition existing = conditionMapper.selectById(condId);
        if (existing == null || !existing.getRouteId().equals(routeId)) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "条件不存在或不属于该路由");
        }
        conditionMapper.deleteById(condId);
    }

    public List<Route> listChildren(Long routeId) {
        Route route = getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        return list(new LambdaQueryWrapper<Route>()
                .eq(Route::getParentRouteId, routeId)
                .orderByAsc(Route::getSortOrder));
    }

    @Transactional
    public void sortRoutes(List<Long> routeIds) {
        if (routeIds == null || routeIds.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "route_ids 不能为空");
        }
        int order = 0;
        for (Long id : routeIds) {
            Route route = getById(id);
            if (route != null) {
                route.setSortOrder(order++);
                updateById(route);
            }
        }
    }

    /** LIKE 通配符转义（PostgreSQL 默认转义符为反斜杠）。 */
    private String escapeLike(String raw) {
        return raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    // ==================== 阶段二 T3：路由复制 ====================

    /**
     * 深复制路由（含 conditions/bindings/tags，不含画布）为新 DRAFT 路由。
     * route_name 原名 + "_copy" 截断到 50；命中唯一索引时追加 _2/_3… 兜底。
     */
    @Transactional
    public Route duplicateRoute(Long routeId) {
        Route source = getById(routeId);
        if (source == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        Route copy = Route.builder()
                .routeName(deriveCopyName(source.getRouteName()))
                .routeType(source.getRouteType())
                .path(source.getPath())
                .upstreamUrl(source.getUpstreamUrl())
                .status("DRAFT")
                .sortOrder(source.getSortOrder())
                .remark(source.getRemark())
                .tags(source.getTags())
                .build();
        save(copy);
        for (RouteCondition cond : conditionMapper.selectList(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getRouteId, routeId))) {
            conditionMapper.insert(RouteCondition.builder()
                    .routeId(copy.getId())
                    .targetRouteId(cond.getTargetRouteId())
                    .conditionType(cond.getConditionType())
                    .operator(cond.getOperator())
                    .conditionKey(cond.getConditionKey())
                    .conditionValue(cond.getConditionValue())
                    .priority(cond.getPriority())
                    .build());
        }
        int order = 0;
        for (RoutePluginBinding binding : bindingMapper.selectList(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId))) {
            bindingMapper.insert(RoutePluginBinding.builder()
                    .routeId(copy.getId())
                    .pluginId(binding.getPluginId())
                    .sortOrder(binding.getSortOrder() != null ? binding.getSortOrder() : order++)
                    .bindingConfig(binding.getBindingConfig() != null ? binding.getBindingConfig() : "{}")
                    .build());
        }
        publishRouteChange(copy.getId(), copy.getConfigVersion(), "CREATE");
        return copy;
    }

    private String deriveCopyName(String original) {
        String base = original + "_copy";
        if (base.length() > 50) {
            base = base.substring(0, 50);
        }
        String candidate = base;
        int i = 1;
        while (count(new LambdaQueryWrapper<Route>().eq(Route::getRouteName, candidate)) > 0) {
            i++;
            String suffix = "_" + i;
            candidate = base.length() + suffix.length() <= 50
                    ? base + suffix
                    : base.substring(0, 50 - suffix.length()) + suffix;
            if (i >= 99) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                        "无法生成副本路由名，请先重命名原路由");
            }
        }
        return candidate;
    }

    private void validateRequiredFields(Route route, List<RouteCondition> conditions) {
        if (route.getRouteName() == null || route.getRouteName().isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路由名称不能为空");
        }
        if (route.getRouteType() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路由类型不能为空");
        }
        if ("BACKEND".equals(route.getRouteType())) {
            if (route.getPath() == null || route.getPath().isEmpty()) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "后端路由路径不能为空");
            }
            if (route.getUpstreamUrl() == null || route.getUpstreamUrl().isEmpty()) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "后端路由上游地址不能为空");
            }
        }
        if ("DISPATCH".equals(route.getRouteType()) && (conditions == null || conditions.isEmpty())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "分发路由必须包含至少一个条件");
        }
    }

    private void validateNoCycle(Route route, List<RouteCondition> conditions) {
        if (conditions == null || conditions.isEmpty()) {
            return;
        }
        java.util.Map<Long, List<RouteCondition>> conditionMap = buildConditionMap(route, conditions);
        routeValidator.validateCyclicReference(route != null ? route.getId() : -1L, conditionMap);
    }

    private java.util.Map<Long, List<RouteCondition>> buildConditionMap(Route route, List<RouteCondition> conditions) {
        java.util.Map<Long, List<RouteCondition>> conditionMap = new java.util.HashMap<>();
        if (route != null && route.getId() != null) {
            conditionMap.put(route.getId(), conditions);
            List<RouteCondition> existingConditions = conditionMapper.selectList(
                    new LambdaQueryWrapper<RouteCondition>()
                            .ne(RouteCondition::getRouteId, route.getId()));
            for (RouteCondition cond : existingConditions) {
                conditionMap.computeIfAbsent(cond.getRouteId(), k -> new java.util.ArrayList<>()).add(cond);
            }
        } else {
            conditionMap.put(-1L, conditions);
        }
        return conditionMap;
    }
}
