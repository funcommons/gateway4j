package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.util.RoutePathUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Service;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 路由模拟（P2-6 Debug 工具第一阶，Apigee Trace-lite）。
 *
 * <p>只回答「这个请求会被谁接住、绑了哪些插件」，<b>不做真实转发</b>。
 * 匹配语义与数据面 {@code DynamicRouteLocator} 逐字对齐：</p>
 * <ul>
 *   <li>仅 status=PUBLISHED 的路由参与；</li>
 *   <li>路径谓词 = {@link PathPatternParser#defaultInstance} 解析
 *       {@code RoutePathUtils.normalizePath(path)} 后 matches（与 engine 同源）；</li>
 *   <li>排序：DISPATCH 优先（order = -1_000_000 + sort_order），BACKEND 按 sort_order
 *       —— engine 的 RoutePredicateHandlerMapping 取顺序第一个命中；</li>
 *   <li>DISPATCH 命中后按 priority 升序求值条件（HEADER/QUERY/PATH 现场求值，
 *       BODY/GROOVY 需要真实请求上下文，Trace-lite 标记跳过），首个命中的
 *       条件决定目标子路由；WEIGHT 非请求谓词，仅列候选不掷点。</li>
 * </ul>
 */
@Slf4j
@Service
public class RouteSimulateService {

    private static final PathPatternParser PATH_PATTERN_PARSER = PathPatternParser.defaultInstance;

    private static final String TYPE_BACKEND = "BACKEND";
    private static final String TYPE_DISPATCH = "DISPATCH";
    private static final int DISPATCH_ORDER_BASE = -1_000_000;

    private final RouteService routeService;
    private final RouteConditionMapper conditionMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final PluginService pluginService;

    public RouteSimulateService(RouteService routeService,
                                RouteConditionMapper conditionMapper,
                                RoutePluginBindingMapper bindingMapper,
                                PluginService pluginService) {
        this.routeService = routeService;
        this.conditionMapper = conditionMapper;
        this.bindingMapper = bindingMapper;
        this.pluginService = pluginService;
    }

    /**
     * 模拟一次请求的路由命中与插件链装配。
     *
     * @param path    请求路径（如 /api/user/1）
     * @param method  HTTP 方法（回显；当前 engine 路径谓词不区分方法）
     * @param headers 模拟请求头（DISPATCH HEADER 条件求值输入）
     * @param query   模拟查询参数（DISPATCH QUERY 条件求值输入）
     */
    public Map<String, Object> simulate(String path, String method,
                                        Map<String, String> headers, Map<String, String> query) {
        String normalizedPath = RoutePathUtils.normalizePath(path);
        Map<String, String> safeHeaders = headers == null ? Map.of() : headers;
        Map<String, String> safeQuery = query == null ? Map.of() : query;

        List<Route> candidates = orderedPublishedRoutes();

        List<Map<String, Object>> evaluated = new ArrayList<>();
        Route matched = null;
        for (Route route : candidates) {
            boolean pathHit = matchPath(route.getPath(), normalizedPath);
            boolean winner = pathHit && matched == null;
            if (winner) {
                matched = route;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("route_id", String.valueOf(route.getId()));
            item.put("route_name", route.getRouteName());
            item.put("route_type", route.getRouteType());
            // matched = 实际接住请求（engine 取顺序第一个命中者），path_matched 仅谓词结果
            item.put("matched", winner);
            item.put("path_matched", pathHit);
            if (!pathHit) {
                item.put("reason", "path 不匹配：路由 " + route.getPath() + " vs 请求 " + normalizedPath);
            } else if (winner) {
                item.put("reason", "path 匹配且排序最前（命中）");
            } else {
                item.put("reason", "path 匹配但已被更早路由命中（engine 取顺序第一个）");
            }
            evaluated.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("matched", matched != null);
        result.put("route", matched != null ? routeSummary(matched) : null);
        result.put("evaluated", evaluated);
        if (matched != null && TYPE_DISPATCH.equals(matched.getRouteType())) {
            result.put("dispatch", resolveDispatch(matched, normalizedPath, safeHeaders, safeQuery));
        }
        result.put("plugins", collectPlugins(matched));
        result.put("request", Map.of(
                "path", normalizedPath,
                "method", method == null || method.isBlank() ? "GET" : method.toUpperCase()));
        return result;
    }

    /** 与 DynamicRouteLocator.getOrder 同序：DISPATCH（-1e6+sort）在前，BACKEND 按 sort。 */
    private List<Route> orderedPublishedRoutes() {
        List<Route> routes = new ArrayList<>(routeService.listRoutes(null, "PUBLISHED", null));
        routes.sort(Comparator.comparingInt(this::routeOrder));
        return routes;
    }

    private int routeOrder(Route route) {
        int sortOrder = route.getSortOrder() != null ? route.getSortOrder() : 0;
        return TYPE_DISPATCH.equals(route.getRouteType()) ? DISPATCH_ORDER_BASE + sortOrder : sortOrder;
    }

    /** 与 engine 同源：PathPatternParser.defaultInstance + RoutePathUtils.normalizePath。 */
    private boolean matchPath(String routePath, String requestPath) {
        if (routePath == null || routePath.isBlank()) {
            return false;
        }
        try {
            PathPattern pattern = PATH_PATTERN_PARSER.parse(RoutePathUtils.normalizePath(routePath));
            return pattern.matches(PathContainer.parsePath(requestPath));
        } catch (Exception e) {
            log.warn("[路由模拟] 路由 path 非法（{}）: {}", routePath, e.getMessage());
            return false;
        }
    }

    private Map<String, Object> routeSummary(Route route) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("id", String.valueOf(route.getId()));
        summary.put("route_name", route.getRouteName());
        summary.put("route_type", route.getRouteType());
        summary.put("path", route.getPath());
        summary.put("upstream_url", route.getUpstreamUrl());
        return summary;
    }

    /**
     * DISPATCH 条件求值 trace：priority 升序逐条求值，命中即锁定目标（与
     * RouteDispatcher「首个匹配且目标可解析者胜出」一致）；WEIGHT 仅列候选。
     */
    private Map<String, Object> resolveDispatch(Route dispatchRoute, String requestPath,
                                                Map<String, String> headers, Map<String, String> query) {
        List<RouteCondition> conditions = conditionMapper.selectList(
                new LambdaQueryWrapper<RouteCondition>()
                        .eq(RouteCondition::getRouteId, dispatchRoute.getId())
                        .orderByAsc(RouteCondition::getPriority));
        List<Route> allPublished = routeService.listRoutes(null, "PUBLISHED", null);
        Map<Long, Route> publishedMap = new LinkedHashMap<>();
        for (Route route : allPublished) {
            publishedMap.put(route.getId(), route);
        }

        List<Map<String, Object>> trace = new ArrayList<>();
        List<Map<String, Object>> weightCandidates = new ArrayList<>();
        Map<String, Object> resolvedTarget = null;

        for (RouteCondition condition : conditions) {
            if ("WEIGHT".equals(condition.getConditionType())) {
                Map<String, Object> candidate = conditionItem(condition, false,
                        "WEIGHT 非请求谓词（加权随机通道，Trace-lite 不掷点）");
                candidate.put("weight", condition.getConditionKey());
                weightCandidates.add(candidate);
                continue;
            }
            Evaluation evaluation = evaluateCondition(condition, requestPath, headers, query);
            Map<String, Object> item = conditionItem(condition, evaluation.matched(), evaluation.reason());
            Long targetId = condition.getTargetRouteId();
            Route target = targetId == null ? null : publishedMap.get(targetId);
            item.put("target_route_id", targetId != null ? String.valueOf(targetId) : null);
            item.put("target_route_name", target != null ? target.getRouteName() : null);
            item.put("target_resolvable", target != null);
            if (evaluation.matched() && resolvedTarget == null) {
                if (target == null) {
                    item.put("reason", evaluation.reason() + "，但目标路由缺失/未发布（engine continue）");
                } else {
                    resolvedTarget = routeSummary(target);
                }
            }
            trace.add(item);
        }

        Map<String, Object> dispatch = new LinkedHashMap<>();
        dispatch.put("conditions", trace);
        dispatch.put("weight_candidates", weightCandidates);
        dispatch.put("resolved_target", resolvedTarget);
        return dispatch;
    }

    private Map<String, Object> conditionItem(RouteCondition condition, boolean matched, String reason) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("condition_type", condition.getConditionType());
        item.put("operator", condition.getOperator());
        item.put("condition_key", condition.getConditionKey());
        item.put("condition_value", condition.getConditionValue());
        item.put("priority", condition.getPriority());
        item.put("matched", matched);
        item.put("reason", reason);
        return item;
    }

    /** HEADER/QUERY/PATH 现场求值（与 engine RouteConditionMatcher 同语义）；BODY/GROOVY 标记跳过。 */
    private Evaluation evaluateCondition(RouteCondition condition, String requestPath,
                                         Map<String, String> headers, Map<String, String> query) {
        String type = condition.getConditionType();
        String operator = condition.getOperator();
        String key = condition.getConditionKey();
        String value = condition.getConditionValue();
        return switch (type) {
            case "HEADER" -> {
                String actual = headers.get(key);
                yield evaluateValue(operator, actual, value);
            }
            case "QUERY" -> {
                String actual = query.get(key);
                yield evaluateValue(operator, actual, value);
            }
            case "PATH" -> evaluateValue(operator, requestPath, value);
            case "BODY" -> new Evaluation(false,
                    "BODY 条件需真实请求体（Trace-lite 不模拟 body，跳过求值）");
            case "GROOVY" -> new Evaluation(false,
                    "GROOVY 条件需真实请求上下文（Trace-lite 不执行脚本，跳过求值）");
            default -> new Evaluation(false, "未知条件类型 " + type + "（engine default 分支恒 false）");
        };
    }

    /** 与 engine RouteConditionMatcher#matchOperator 逐字对齐（含缺 key 时的 EXISTS/NE 特例）。 */
    private Evaluation evaluateValue(String operator, String actual, String expected) {
        if (actual == null || actual.isEmpty()) {
            if ("EXISTS".equals(operator)) {
                return new Evaluation(false, "键不存在（EXISTS=false）");
            }
            if ("NE".equals(operator)) {
                return new Evaluation(true, "键不存在（NE=true，与 engine 缺值语义一致）");
            }
            return new Evaluation(false, "键不存在");
        }
        boolean matched = switch (operator) {
            case "EQ" -> actual.equals(expected);
            case "NE" -> !actual.equals(expected);
            case "CONTAINS" -> actual.contains(expected);
            case "REGEX" -> Pattern.compile(expected).matcher(actual).find();
            case "EXISTS" -> true;
            case "GT" -> compareNumeric(actual, expected) > 0;
            case "LT" -> compareNumeric(actual, expected) < 0;
            default -> false;
        };
        return new Evaluation(matched, "actual=" + actual + ", expected=" + expected + ", operator=" + operator);
    }

    private int compareNumeric(String actual, String expected) {
        try {
            double a = Double.parseDouble(actual);
            double b = Double.parseDouble(expected);
            return Double.compare(a, b);
        } catch (NumberFormatException e) {
            return actual.compareTo(expected);
        }
    }

    /**
     * 插件链装配预览：global_pre（GLOBAL+PRE+ENABLED）、route（命中路由的路由级绑定，
     * DISPATCH 命中时合并目标子路由绑定）、global_post。
     */
    private Map<String, Object> collectPlugins(Route matched) {
        List<Map<String, Object>> routePlugins = new ArrayList<>();
        if (matched != null) {
            appendRouteBindings(matched, routePlugins);
            if (TYPE_DISPATCH.equals(matched.getRouteType())) {
                for (RouteCondition condition : conditionMapper.selectList(
                        new LambdaQueryWrapper<RouteCondition>()
                                .eq(RouteCondition::getRouteId, matched.getId()))) {
                    Route target = condition.getTargetRouteId() == null ? null
                            : routeService.getById(condition.getTargetRouteId());
                    if (target != null) {
                        appendRouteBindings(target, routePlugins);
                    }
                }
            }
        }

        Map<String, Object> plugins = new LinkedHashMap<>();
        plugins.put("global_pre", pluginSummaries(pluginService.listGlobalPlugins("PRE")));
        plugins.put("route", routePlugins);
        plugins.put("global_post", pluginSummaries(pluginService.listGlobalPlugins("POST")));
        return plugins;
    }

    private void appendRouteBindings(Route route, List<Map<String, Object>> out) {
        for (RoutePluginBinding binding : bindingMapper.selectList(
                new LambdaQueryWrapper<RoutePluginBinding>()
                        .eq(RoutePluginBinding::getRouteId, route.getId())
                        .orderByAsc(RoutePluginBinding::getSortOrder))) {
            Plugin plugin = binding.getPluginId() == null ? null
                    : pluginService.getById(binding.getPluginId());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("plugin_id", binding.getPluginId() != null ? String.valueOf(binding.getPluginId()) : null);
            item.put("plugin_name", plugin != null ? plugin.getPluginName() : null);
            item.put("plugin_type", plugin != null ? plugin.getPluginType() : null);
            item.put("plugin_phase", plugin != null ? plugin.getPluginPhase() : null);
            item.put("plugin_status", plugin != null ? plugin.getStatus() : null);
            item.put("sort_order", binding.getSortOrder());
            item.put("binding_config", binding.getBindingConfig());
            item.put("bound_route_id", String.valueOf(route.getId()));
            item.put("bound_route_name", route.getRouteName());
            out.add(item);
        }
    }

    private List<Map<String, Object>> pluginSummaries(List<Plugin> plugins) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (plugins == null) {
            return result;
        }
        for (Plugin plugin : plugins) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", String.valueOf(plugin.getId()));
            item.put("plugin_name", plugin.getPluginName());
            item.put("plugin_id", plugin.getPluginId());
            item.put("plugin_type", plugin.getPluginType());
            item.put("plugin_phase", plugin.getPluginPhase());
            item.put("sort_order", plugin.getSortOrder());
            result.add(item);
        }
        return result;
    }

    /** 条件求值结果（值对象）。 */
    private record Evaluation(boolean matched, String reason) {
    }
}
