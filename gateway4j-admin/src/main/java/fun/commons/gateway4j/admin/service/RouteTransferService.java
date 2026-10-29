package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
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
        return exportRoutes(routeIds, status, null);
    }

    /**
     * 导出（P2-2 多环境）：environment 可选筛选（null = 全环境）；导出包顶层
     * 携带 environment 指纹——所选路由同属一个环境时为该环境标识，混合导出为
     * "mixed"，供导入侧预检展示与审计。
     */
    public RoutePackage exportRoutes(List<Long> routeIds, String status, String environment) {
        boolean envFilter = environment != null && !environment.isEmpty();
        List<Route> routes;
        if (routeIds != null && !routeIds.isEmpty()) {
            routes = routeService.listByIds(routeIds);
        } else if (status != null && !status.isEmpty()) {
            routes = envFilter
                    ? routeService.listRoutes(null, status, null, null, environment)
                    : routeService.listRoutes(null, status, null);
        } else {
            routes = envFilter
                    ? routeService.listRoutes(null, null, null, null, environment)
                    : routeService.listRoutes(null, null, null);
        }
        if (routes.isEmpty()) {
            return new RoutePackage("1.0", System.currentTimeMillis(), List.of(),
                    envFilter ? environment : null);
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
        // 环境指纹：请求显式指定 environment 时以其为准（筛选结果必然同环境）；
        // 否则按所选路由去重——单环境取该值，混合环境 "mixed"。
        String fingerprint;
        if (environment != null && !environment.isEmpty()) {
            fingerprint = environment;
        } else {
            java.util.Set<String> envs = all.stream()
                    .map(RouteTransferService::environmentOf)
                    .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
            fingerprint = envs.size() == 1 ? envs.iterator().next() : MIXED_ENVIRONMENT;
        }
        return new RoutePackage("1.0", System.currentTimeMillis(), nodes, fingerprint);
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
        return importRoutes(pkg, strategy, null);
    }

    /**
     * 导入（P2-2 多环境）：目标环境 = 请求可选参数（缺省/旧包 = default）。
     * 冲突比对收敛在目标环境内——同 environment 内同名即冲突（SKIP/OVERWRITE/ERROR
     * 语义不变），环境不同即视为新增（对应 (environment, route_name) 联合唯一索引）。
     * 新建路由落目标环境；OVERWRITE 命中的既有路由不改变其环境。
     */
    @Transactional
    public Map<String, Object> importRoutes(RoutePackage pkg, String strategy, String targetEnvironment) {
        if (pkg == null || pkg.routes() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "导入包不能为空");
        }
        if (!List.of("SKIP", "OVERWRITE", "ERROR").contains(strategy)) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "strategy 必须为 SKIP/OVERWRITE/ERROR");
        }
        String targetEnv = RouteService.normalizeEnvironment(targetEnvironment);

        List<RoutePackage.RouteNode> flat = new ArrayList<>();
        flatten(pkg.routes(), null, flat);

        int created = 0, updated = 0, skipped = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        Map<String, Long> idByName = new HashMap<>();

        // 第一遍：建/改路由主体（仅在目标环境内比对同名）
        for (RoutePackage.RouteNode node : flat) {
            Route existing = findByNameInEnv(node.routeName(), targetEnv);
            try {
                if (existing == null) {
                    Route route = buildRoute(node, targetEnv);
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
            wireConditions(routeId, node, idByName, targetEnv, errors);
            wireBindings(routeId, node, pluginByPid, errors);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("environment", targetEnv);
        result.put("package_environment", packageEnvironmentOf(pkg));
        result.put("total", flat.size());
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        return result;
    }

    private void wireConditions(Long routeId, RoutePackage.RouteNode node,
                                Map<String, Long> idByName, String environment,
                                List<Map<String, Object>> errors) {
        if (node.conditions() == null) return;
        for (RoutePackage.ConditionNode c : node.conditions()) {
            Long targetId = idByName.get(c.targetRouteKey());
            if (targetId == null) {
                // 条件目标与环境约束一致：只在目标环境内找（跨环境引用视为目标缺失）
                Route target = findByNameInEnv(c.targetRouteKey(), environment);
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
        return validateImport(pkg, null);
    }

    /**
     * 预检（P2-2 多环境）：返回体新增 {@code environment}（目标环境，缺省 default）
     * 与 {@code package_environment}（包内指纹，旧包为 default）；conflicts 按
     * 目标环境内同名比对——环境不同的同名路由不冲突，将按新增处理。
     */
    public Map<String, Object> validateImport(RoutePackage pkg, String targetEnvironment) {
        String targetEnv = RouteService.normalizeEnvironment(targetEnvironment);
        List<String> conflicts = new ArrayList<>();
        List<String> missingPlugins = new ArrayList<>();
        List<String> missingTargets = new ArrayList<>();
        List<String> cycleWarnings = new ArrayList<>();

        if (pkg == null || pkg.routes() == null) {
            return Map.of("is_valid", false, "conflicts", conflicts,
                    "missing_plugins", missingPlugins, "missing_targets", missingTargets,
                    "environment", targetEnv,
                    "package_environment", packageEnvironmentOf(pkg),
                    "cycle_warnings", List.of("导入包为空"));
        }

        List<RoutePackage.RouteNode> flat = new ArrayList<>();
        flatten(pkg.routes(), null, flat);
        Set<String> namesInPkg = flat.stream().map(RoutePackage.RouteNode::routeName)
                .collect(Collectors.toSet());

        for (RoutePackage.RouteNode node : flat) {
            if (findByNameInEnv(node.routeName(), targetEnv) != null) {
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
                    if (!namesInPkg.contains(key) && findByNameInEnv(key, targetEnv) == null
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
        result.put("environment", targetEnv);
        result.put("package_environment", packageEnvironmentOf(pkg));
        result.put("conflicts", conflicts);
        result.put("missing_plugins", missingPlugins);
        result.put("missing_targets", missingTargets);
        result.put("cycle_warnings", cycleWarnings);
        return result;
    }

    // ==================== 内部工具 ====================

    /** P2-2 多环境：混合环境导出的顶层指纹值。 */
    public static final String MIXED_ENVIRONMENT = "mixed";

    /** 路由行的有效环境：null/blank 归一 default（向后兼容旧包/存量行；口径在 common）。 */
    private static String environmentOf(Route route) {
        return route == null ? Route.DEFAULT_ENVIRONMENT : Route.environmentOr(route.getEnvironment());
    }

    /** 包内环境指纹：旧包（无该字段）按 default 展示。 */
    private static String packageEnvironmentOf(RoutePackage pkg) {
        if (pkg == null || pkg.environment() == null || pkg.environment().isBlank()) {
            return Route.DEFAULT_ENVIRONMENT;
        }
        return pkg.environment();
    }

    private void flatten(List<RoutePackage.RouteNode> nodes, String parentName,
                         List<RoutePackage.RouteNode> out) {
        if (nodes == null) return;
        for (RoutePackage.RouteNode node : nodes) {
            out.add(node);
            flatten(node.children(), node.routeName(), out);
        }
    }

    /** P2-2 多环境：目标环境内的同名路由（唯一索引 (environment, route_name) 口径）。 */
    private Route findByNameInEnv(String routeName, String environment) {
        if (routeName == null) return null;
        return routeService.getOne(new LambdaQueryWrapper<Route>()
                .eq(Route::getRouteName, routeName)
                .eq(Route::getEnvironment, environment), false);
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

    private Route buildRoute(RoutePackage.RouteNode node, String environment) {
        return Route.builder()
                .routeName(node.routeName())
                .routeType(node.routeType())
                .path(node.path())
                .upstreamUrl(node.upstreamUrl())
                .sortOrder(node.sortOrder() != null ? node.sortOrder() : 0)
                .remark(node.remark())
                // P2-2 多环境：新建路由落目标环境（旧包/缺省参数 = default）
                .environment(environment)
                .status("DRAFT")
                .build();
    }

    private void applyNode(Route existing, RoutePackage.RouteNode node) {
        existing.setRouteType(node.routeType());
        existing.setPath(node.path());
        existing.setUpstreamUrl(node.upstreamUrl());
        if (node.sortOrder() != null) existing.setSortOrder(node.sortOrder());
        if (node.remark() != null) existing.setRemark(node.remark());
        // 注意：OVERWRITE 不改变既有路由的 environment（环境迁移不走导入通道）
        existing.setStatus("DRAFT");
    }

    private void clearChildren(Long routeId) {
        conditionMapper.delete(new LambdaQueryWrapper<RouteCondition>()
                .eq(RouteCondition::getRouteId, routeId));
        bindingMapper.delete(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId));
    }
}
