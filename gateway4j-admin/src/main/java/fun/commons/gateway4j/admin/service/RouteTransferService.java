package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.PluginMapper;
import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 路由配置导入导出。导出包自包含：引用关系用 route_name（route_key）和
 * plugin_id 字符串，不含雪花 ID，可跨环境导入。
 */
@Service
public class RouteTransferService {

    private final RouteService routeService;
    private final RouteConditionMapper conditionMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final PluginMapper pluginMapper;
    private final RouteValidator routeValidator;

    public RouteTransferService(RouteService routeService,
                                RouteConditionMapper conditionMapper,
                                RoutePluginBindingMapper bindingMapper,
                                PluginMapper pluginMapper,
                                RouteValidator routeValidator) {
        this.routeService = routeService;
        this.conditionMapper = conditionMapper;
        this.bindingMapper = bindingMapper;
        this.pluginMapper = pluginMapper;
        this.routeValidator = routeValidator;
    }

    // ==================== 导出 ====================

    public RoutePackage exportRoutes(List<Long> routeIds, String status) {
        List<Route> routes;
        if (routeIds != null && !routeIds.isEmpty()) {
            routes = routeService.listByIds(routeIds);
        } else if (status != null && !status.isEmpty()) {
            routes = routeService.listRoutes(null, status, null);
        } else {
            routes = routeService.listRoutes(null, null, null);
        }
        if (routes.isEmpty()) {
            return new RoutePackage("1.0", System.currentTimeMillis(), List.of());
        }

        Set<Long> includeIds = collectWithDescendants(routes);
        List<Route> all = routeService.listByIds(includeIds);
        Map<Long, Route> byId = all.stream().collect(Collectors.toMap(Route::getId, r -> r));
        Map<Long, String> nameById = all.stream()
                .collect(Collectors.toMap(Route::getId, Route::getRouteName));

        List<RouteCondition> conditions = conditionMapper.selectList(
                new LambdaQueryWrapper<RouteCondition>().in(RouteCondition::getRouteId, includeIds));
        Map<Long, List<RouteCondition>> condByRoute = conditions.stream()
                .collect(Collectors.groupingBy(RouteCondition::getRouteId));

        List<RoutePluginBinding> bindings = bindingMapper.selectList(
                new LambdaQueryWrapper<RoutePluginBinding>().in(RoutePluginBinding::getRouteId, includeIds));
        Map<Long, List<RoutePluginBinding>> bindByRoute = bindings.stream()
                .collect(Collectors.groupingBy(RoutePluginBinding::getRouteId));

        Map<Long, Plugin> pluginById = new HashMap<>();
        List<Long> pluginIds = bindings.stream().map(RoutePluginBinding::getPluginId).distinct().toList();
        if (!pluginIds.isEmpty()) {
            pluginMapper.selectByIds(pluginIds).forEach(p -> pluginById.put(p.getId(), p));
        }

        Map<Long, List<Route>> childrenMap = new HashMap<>();
        List<Route> roots = new ArrayList<>();
        for (Route r : all) {
            if (r.getParentRouteId() != null && includeIds.contains(r.getParentRouteId())) {
                childrenMap.computeIfAbsent(r.getParentRouteId(), k -> new ArrayList<>()).add(r);
            } else {
                roots.add(r);
            }
        }
        roots.sort((a, b) -> Integer.compare(
                a.getSortOrder() != null ? a.getSortOrder() : 0,
                b.getSortOrder() != null ? b.getSortOrder() : 0));

        List<RoutePackage.RouteNode> nodes = roots.stream()
                .map(r -> toNode(r, childrenMap, condByRoute, bindByRoute, pluginById, nameById))
                .toList();
        return new RoutePackage("1.0", System.currentTimeMillis(), nodes);
    }

    private Set<Long> collectWithDescendants(List<Route> roots) {
        Set<Long> ids = new HashSet<>();
        List<Long> queue = roots.stream().map(Route::getId).toList();
        ids.addAll(queue);
        while (!queue.isEmpty()) {
            List<Route> children = routeService.list(new LambdaQueryWrapper<Route>()
                    .in(Route::getParentRouteId, queue));
            queue = children.stream().map(Route::getId)
                    .filter(id -> !ids.contains(id)).toList();
            ids.addAll(queue);
        }
        return ids;
    }

    private RoutePackage.RouteNode toNode(Route route,
                                          Map<Long, List<Route>> childrenMap,
                                          Map<Long, List<RouteCondition>> condByRoute,
                                          Map<Long, List<RoutePluginBinding>> bindByRoute,
                                          Map<Long, Plugin> pluginById,
                                          Map<Long, String> nameById) {
        List<RoutePackage.ConditionNode> condNodes = condByRoute.getOrDefault(route.getId(), List.of())
                .stream()
                .map(c -> new RoutePackage.ConditionNode(
                        c.getConditionType(), c.getOperator(), c.getConditionKey(), c.getConditionValue(),
                        nameById.get(c.getTargetRouteId()), c.getPriority()))
                .toList();

        List<RoutePackage.PluginNode> pluginNodes = bindByRoute.getOrDefault(route.getId(), List.of())
                .stream()
                .map(b -> {
                    Plugin p = pluginById.get(b.getPluginId());
                    return new RoutePackage.PluginNode(
                            p != null ? p.getPluginId() : String.valueOf(b.getPluginId()),
                            b.getBindingConfig(), b.getSortOrder());
                })
                .toList();

        List<RoutePackage.RouteNode> childNodes = childrenMap.getOrDefault(route.getId(), List.of())
                .stream()
                .map(c -> toNode(c, childrenMap, condByRoute, bindByRoute, pluginById, nameById))
                .toList();

        return new RoutePackage.RouteNode(
                route.getRouteName(), route.getRouteType(), route.getPath(), route.getUpstreamUrl(),
                route.getSortOrder(), route.getRemark(), condNodes, pluginNodes, childNodes);
    }

    // ==================== 导入 ====================

    @Transactional
    public Map<String, Object> importRoutes(RoutePackage pkg, String strategy) {
        if (pkg == null || pkg.routes() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "导入包不能为空");
        }
        if (!List.of("SKIP", "OVERWRITE", "ERROR").contains(strategy)) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "strategy 必须为 SKIP/OVERWRITE/ERROR");
        }

        List<RoutePackage.RouteNode> flat = new ArrayList<>();
        flatten(pkg.routes(), null, flat);

        int created = 0, updated = 0, skipped = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        Map<String, Long> idByName = new HashMap<>();

        // 第一遍：建/改路由主体
        for (RoutePackage.RouteNode node : flat) {
            Route existing = findByName(node.routeName());
            try {
                if (existing == null) {
                    Route route = buildRoute(node);
                    routeService.save(route);
                    idByName.put(node.routeName(), route.getId());
                    created++;
                } else if ("SKIP".equals(strategy)) {
                    idByName.put(node.routeName(), existing.getId());
                    skipped++;
                } else if ("ERROR".equals(strategy)) {
                    errors.add(Map.of("route_name", node.routeName(), "message", "同名路由已存在"));
                } else { // OVERWRITE
                    applyNode(existing, node);
                    routeService.updateById(existing);
                    clearChildren(existing.getId());
                    idByName.put(node.routeName(), existing.getId());
                    updated++;
                }
            } catch (Exception e) {
                errors.add(Map.of("route_name", node.routeName(), "message", e.getMessage()));
            }
        }

        // 第二遍：条件 + 插件绑定
        Map<String, Plugin> pluginByPid = loadPluginsByPid();
        for (RoutePackage.RouteNode node : flat) {
            Long routeId = idByName.get(node.routeName());
            if (routeId == null) continue;
            wireConditions(routeId, node, idByName, errors);
            wireBindings(routeId, node, pluginByPid, errors);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", flat.size());
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        return result;
    }

    private void wireConditions(Long routeId, RoutePackage.RouteNode node,
                                Map<String, Long> idByName, List<Map<String, Object>> errors) {
        if (node.conditions() == null) return;
        for (RoutePackage.ConditionNode c : node.conditions()) {
            Long targetId = idByName.get(c.targetRouteKey());
            if (targetId == null) {
                Route target = findByName(c.targetRouteKey());
                targetId = target != null ? target.getId() : null;
            }
            if (targetId == null) {
                errors.add(Map.of("route_name", node.routeName(),
                        "message", "条件目标路由不存在: " + c.targetRouteKey()));
                continue;
            }
            RouteCondition cond = RouteCondition.builder()
                    .routeId(routeId)
                    .conditionType(c.conditionType())
                    .operator(c.operator())
                    .conditionKey(c.conditionKey())
                    .conditionValue(c.conditionValue())
                    .targetRouteId(targetId)
                    .priority(c.priority() != null ? c.priority() : 0)
                    .build();
            conditionMapper.insert(cond);
        }
    }

    private void wireBindings(Long routeId, RoutePackage.RouteNode node,
                              Map<String, Plugin> pluginByPid, List<Map<String, Object>> errors) {
        if (node.plugins() == null) return;
        int order = 0;
        for (RoutePackage.PluginNode p : node.plugins()) {
            Plugin plugin = pluginByPid.get(p.pluginId());
            if (plugin == null) {
                errors.add(Map.of("route_name", node.routeName(),
                        "message", "插件不存在: " + p.pluginId()));
                continue;
            }
            RoutePluginBinding binding = RoutePluginBinding.builder()
                    .routeId(routeId)
                    .pluginId(plugin.getId())
                    .sortOrder(p.sortOrder() != null ? p.sortOrder() : order++)
                    .bindingConfig(p.bindingConfig() != null ? p.bindingConfig() : "{}")
                    .build();
            bindingMapper.insert(binding);
        }
    }

    // ==================== 预检 ====================

    public Map<String, Object> validateImport(RoutePackage pkg) {
        List<String> conflicts = new ArrayList<>();
        List<String> missingPlugins = new ArrayList<>();
        List<String> missingTargets = new ArrayList<>();
        List<String> cycleWarnings = new ArrayList<>();

        if (pkg == null || pkg.routes() == null) {
            return Map.of("is_valid", false, "conflicts", conflicts,
                    "missing_plugins", missingPlugins, "missing_targets", missingTargets,
                    "cycle_warnings", List.of("导入包为空"));
        }

        List<RoutePackage.RouteNode> flat = new ArrayList<>();
        flatten(pkg.routes(), null, flat);
        Set<String> namesInPkg = flat.stream().map(RoutePackage.RouteNode::routeName)
                .collect(Collectors.toSet());

        for (RoutePackage.RouteNode node : flat) {
            if (findByName(node.routeName()) != null) {
                conflicts.add(node.routeName());
            }
            if (node.plugins() != null) {
                for (RoutePackage.PluginNode p : node.plugins()) {
                    if (findPluginByPid(p.pluginId()) == null && !missingPlugins.contains(p.pluginId())) {
                        missingPlugins.add(p.pluginId());
                    }
                }
            }
            if (node.conditions() != null) {
                for (RoutePackage.ConditionNode c : node.conditions()) {
                    String key = c.targetRouteKey();
                    if (key == null) continue;
                    if (!namesInPkg.contains(key) && findByName(key) == null
                            && !missingTargets.contains(key)) {
                        missingTargets.add(key);
                    }
                }
            }
        }

        // 循环检测：用包内名字构造虚拟 ID 图
        Map<String, Long> virtualIds = new HashMap<>();
        long vid = 1;
        for (RoutePackage.RouteNode node : flat) {
            virtualIds.put(node.routeName(), vid++);
        }
        Map<Long, List<RouteCondition>> condMap = new HashMap<>();
        for (RoutePackage.RouteNode node : flat) {
            if (node.conditions() == null) continue;
            Long from = virtualIds.get(node.routeName());
            for (RoutePackage.ConditionNode c : node.conditions()) {
                Long to = virtualIds.get(c.targetRouteKey());
                if (to != null) {
                    condMap.computeIfAbsent(from, k -> new ArrayList<>())
                            .add(RouteCondition.builder().routeId(from).targetRouteId(to).build());
                }
            }
        }
        for (RoutePackage.RouteNode node : flat) {
            Long from = virtualIds.get(node.routeName());
            try {
                routeValidator.validateCyclicReference(from, condMap);
            } catch (CyclicReferenceException e) {
                cycleWarnings.add(node.routeName() + ": " + e.getMessage());
            }
        }

        boolean valid = missingPlugins.isEmpty() && missingTargets.isEmpty() && cycleWarnings.isEmpty();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("is_valid", valid);
        result.put("conflicts", conflicts);
        result.put("missing_plugins", missingPlugins);
        result.put("missing_targets", missingTargets);
        result.put("cycle_warnings", cycleWarnings);
        return result;
    }

    // ==================== 内部工具 ====================

    private void flatten(List<RoutePackage.RouteNode> nodes, String parentName,
                         List<RoutePackage.RouteNode> out) {
        if (nodes == null) return;
        for (RoutePackage.RouteNode node : nodes) {
            out.add(node);
            flatten(node.children(), node.routeName(), out);
        }
    }

    private Route findByName(String routeName) {
        if (routeName == null) return null;
        return routeService.getOne(new LambdaQueryWrapper<Route>()
                .eq(Route::getRouteName, routeName), false);
    }

    private Plugin findPluginByPid(String pluginId) {
        if (pluginId == null) return null;
        return pluginMapper.selectOne(new LambdaQueryWrapper<Plugin>()
                .eq(Plugin::getPluginId, pluginId));
    }

    private Map<String, Plugin> loadPluginsByPid() {
        return pluginMapper.selectList(null).stream()
                .collect(Collectors.toMap(Plugin::getPluginId, p -> p, (a, b) -> a));
    }

    private Route buildRoute(RoutePackage.RouteNode node) {
        return Route.builder()
                .routeName(node.routeName())
                .routeType(node.routeType())
                .path(node.path())
                .upstreamUrl(node.upstreamUrl())
                .sortOrder(node.sortOrder() != null ? node.sortOrder() : 0)
                .remark(node.remark())
                .status("DRAFT")
                .build();
    }

    private void applyNode(Route existing, RoutePackage.RouteNode node) {
        existing.setRouteType(node.routeType());
        existing.setPath(node.path());
        existing.setUpstreamUrl(node.upstreamUrl());
        if (node.sortOrder() != null) existing.setSortOrder(node.sortOrder());
        if (node.remark() != null) existing.setRemark(node.remark());
        existing.setStatus("DRAFT");
    }

    private void clearChildren(Long routeId) {
        conditionMapper.delete(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getRouteId, routeId));
        bindingMapper.delete(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId));
    }
}
