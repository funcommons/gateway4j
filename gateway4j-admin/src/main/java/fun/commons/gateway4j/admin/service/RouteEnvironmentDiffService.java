package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * P2-5 环境间 diff：对比两个环境中同名路由（route_name 为对齐键）的配置差异。
 * <p>
 * 输出三段：{@code only_in_from}（仅 from 环境存在）、{@code only_in_to}（仅 to
 * 环境存在）、{@code changed}（同名但字段不同，逐字段给 {@code {from,to}}）。
 * 比对字段集：path / upstream_url / status / sort_order / remark（备注按任务口径
 * 一并纳入；environment 本身因两侧环境不同不参与比对）。
 * <p>
 * 「环境不存在」口径：系统中环境无独立表，gw_route 里没有任何该环境路由即视为
 * 不存在 → 业务异常（信封 10605，与全站业务错误一致——本管理面业务错误统一
 * HTTP 200 + 失败信封，见 AdminGlobalExceptionHandler）。
 */
@Service
public class RouteEnvironmentDiffService {

    private final RouteService routeService;

    public RouteEnvironmentDiffService(RouteService routeService) {
        this.routeService = routeService;
    }

    /** 环境间 diff 主流程（from/to 均为必填环境标识）。 */
    public Map<String, Object> diff(String fromRaw, String toRaw) {
        String from = requireEnvironment(fromRaw, "from");
        String to = requireEnvironment(toRaw, "to");
        Map<String, Route> fromByName = routesByName(from);
        Map<String, Route> toByName = routesByName(to);

        List<Map<String, Object>> onlyInFrom = new ArrayList<>();
        List<Map<String, Object>> onlyInTo = new ArrayList<>();
        List<Map<String, Object>> changed = new ArrayList<>();

        for (Map.Entry<String, Route> entry : fromByName.entrySet()) {
            Route toRoute = toByName.get(entry.getKey());
            if (toRoute == null) {
                onlyInFrom.add(summary(entry.getValue()));
                continue;
            }
            Map<String, Object> fields = fieldDiff(entry.getValue(), toRoute);
            if (!fields.isEmpty()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("route_name", entry.getKey());
                item.put("fields", fields);
                changed.add(item);
            }
        }
        for (Map.Entry<String, Route> entry : toByName.entrySet()) {
            if (!fromByName.containsKey(entry.getKey())) {
                onlyInTo.add(summary(entry.getValue()));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("only_in_from", onlyInFrom);
        result.put("only_in_to", onlyInTo);
        result.put("changed", changed);
        return result;
    }

    // ==================== 内部工具 ====================

    /** 环境标识必填 + 白名单校验（与 RouteService.normalizeEnvironment 同口径）。 */
    private String requireEnvironment(String raw, String param) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, param + " 环境标识不能为空");
        }
        String value = raw.trim();
        if (!value.matches(Route.ENVIRONMENT_PATTERN)) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    param + " 环境标识须为 1-20 位小写字母、数字、下划线或中划线: " + value);
        }
        return value;
    }

    /** 按环境取路由并按 route_name 对齐（同环境内 route_name 唯一，TreeMap 保证输出稳定）。 */
    private Map<String, Route> routesByName(String environment) {
        List<Route> routes = routeService.listRoutes(null, null, null, null, environment);
        if (routes.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "环境不存在: " + environment);
        }
        Map<String, Route> byName = new TreeMap<>();
        for (Route route : routes) {
            byName.put(route.getRouteName(), route);
        }
        return byName;
    }

    /** 逐字段比对（字段集：path/upstream_url/status/sort_order/remark），返回差异字段 → {from,to}。 */
    private Map<String, Object> fieldDiff(Route fromRoute, Route toRoute) {
        Map<String, Object> fields = new LinkedHashMap<>();
        putIfChanged(fields, "path", fromRoute.getPath(), toRoute.getPath());
        putIfChanged(fields, "upstream_url", fromRoute.getUpstreamUrl(), toRoute.getUpstreamUrl());
        putIfChanged(fields, "status", fromRoute.getStatus(), toRoute.getStatus());
        putIfChanged(fields, "sort_order", normalizeSortOrder(fromRoute), normalizeSortOrder(toRoute));
        putIfChanged(fields, "remark", normalizeRemark(fromRoute), normalizeRemark(toRoute));
        return fields;
    }

    private void putIfChanged(Map<String, Object> fields, String name, Object from, Object to) {
        if (!Objects.equals(from, to)) {
            Map<String, Object> pair = new LinkedHashMap<>();
            pair.put("from", from);
            pair.put("to", to);
            fields.put(name, pair);
        }
    }

    private Integer normalizeSortOrder(Route route) {
        return route.getSortOrder() != null ? route.getSortOrder() : 0;
    }

    private String normalizeRemark(Route route) {
        return route.getRemark() != null ? route.getRemark() : "";
    }

    /** only_in_from/only_in_to 项的路由摘要。 */
    private Map<String, Object> summary(Route route) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", route.getId() != null ? String.valueOf(route.getId()) : null);
        item.put("route_name", route.getRouteName());
        item.put("environment", Route.environmentOr(route.getEnvironment()));
        item.put("route_type", route.getRouteType());
        item.put("path", route.getPath());
        item.put("upstream_url", route.getUpstreamUrl());
        item.put("status", route.getStatus());
        item.put("sort_order", route.getSortOrder());
        item.put("remark", route.getRemark());
        return item;
    }
}
