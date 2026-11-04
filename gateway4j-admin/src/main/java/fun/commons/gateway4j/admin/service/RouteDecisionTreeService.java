package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 路由决策树聚合服务（UI v2 决策树视图，契约 §4 S7，docs/ui-v2/实施契约.md）。
 *
 * <p>把 gw_route（parentRouteId 邻接表）+ gw_route_condition（分发条件边）+
 * {@link RouteTrafficSummaryService} 流量指标聚成一棵以 target 为边、可嵌套（深 ≤
 * {@link GatewayConstants#MAX_DISPATCH_DEPTH}）的决策树。</p>
 *
 * <p><b>查询铁律（N+1 防护）</b>：routeMapper.selectList 全量 1 次 +
 * conditionMapper.selectList 全量 1 次 + {@code summary()} 1 次，共 3 次查询，
 * 内存组 routeMap / edgesByRoute / metricsByRouteId；严禁逐节点 listChildren /
 * 逐节点查条件 / 逐节点取指标（5 层最坏 O(b^5)）。</p>
 *
 * <p><b>口径裁决</b>：① 指标 join 按 route_id（summary 行 route_id 与
 * String.valueOf 路由 id 相等），不走 path join；② hit_ratio 分母 = 本层各边对应
 * target 的 hits_24h（null 按 0）之和，同一 target 多条边重复计入，分母 0 → 全 0.0
 * 不除零，「未命中」无服务端数据由前端 1−Σ 推导；③ weight 仅 WEIGHT 边解析，
 * 双口径分层：引擎 RouteDispatcher.parseWeight（gateway4j-engine）为 Long.parseLong
 * 后 &gt;0 即有效，long 全域参与加权（超 int 上限的权重引擎会真实参与分流）；
 * admin 侧是显示层约束——Integer 上限，超限显示为 null（显示约束，非语义判定）；
 * 若未来灰度滑杆放开大权重，需 widening 为 Long 并同步测试
 * assertInstanceOf(Integer.class) 固化；
 * ④ target_resolvable = 目标存在且 status==PUBLISHED（include_unpublished 展示语义，
 * 与 dispatchWeighted 口径一致，与指标 join 互不影响）；⑤ id 一律 String.valueOf
 * 防 JS 精度丢失，键名 snake_case。</p>
 *
 * <p><b>降级铁律</b>：{@code summary()} 内部已零抛（Prometheus 失败回退快照），
 * 本服务不再包 try/catch 吞异常——吞了会把「source=snapshot 降级」错误升格成 500。</p>
 */
@Service
public class RouteDecisionTreeService {

    private static final String TYPE_DISPATCH = "DISPATCH";

    private static final String TYPE_WEIGHT = "WEIGHT";

    private static final String STATUS_PUBLISHED = "PUBLISHED";

    /** summary() 无行时的根 source 缺省值（全量降级态语义）。 */
    private static final String DEFAULT_SOURCE = "snapshot";

    private final RouteMapper routeMapper;

    private final RouteConditionMapper conditionMapper;

    private final RouteTrafficSummaryService trafficSummaryService;

    public RouteDecisionTreeService(RouteMapper routeMapper,
                                    RouteConditionMapper conditionMapper,
                                    RouteTrafficSummaryService trafficSummaryService) {
        this.routeMapper = routeMapper;
        this.conditionMapper = conditionMapper;
        this.trafficSummaryService = trafficSummaryService;
    }

    /**
     * 聚合以 routeId 为根的决策树。routeId 不存在 →
     * {@link BusinessException}({@link ErrorCode#ROUTE_NOT_FOUND})。
     */
    public Map<String, Object> decisionTree(Long routeId) {
        // ---- 查询 1/3：路由全量（含未发布，展示语义；逻辑删除由 @TableLogic 过滤）----
        List<Route> routes = routeMapper.selectList(
                new LambdaQueryWrapper<Route>().orderByAsc(Route::getSortOrder));
        Map<Long, Route> routeMap = new HashMap<>();
        for (Route route : routes) {
            routeMap.put(route.getId(), route);
        }
        Route root = routeId == null ? null : routeMap.get(routeId);
        if (root == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }

        // ---- 查询 2/3：条件全量，按 routeId 分组（组内 priority 升序 = 求值序，稳定排序）----
        List<RouteCondition> conditions = conditionMapper.selectList(
                new LambdaQueryWrapper<RouteCondition>().orderByAsc(RouteCondition::getPriority));
        Map<Long, List<RouteCondition>> edgesByRoute = new HashMap<>();
        for (RouteCondition condition : conditions) {
            if (condition.getRouteId() != null) {
                edgesByRoute.computeIfAbsent(condition.getRouteId(), k -> new ArrayList<>()).add(condition);
            }
        }
        for (List<RouteCondition> edges : edgesByRoute.values()) {
            edges.sort(Comparator.comparingInt(RouteDecisionTreeService::priorityOf));
        }

        // ---- 查询 3/3：流量指标（内部零抛；行 key=route_id，source 取首行、空表 snapshot）----
        List<Map<String, Object>> summaryRows = trafficSummaryService.summary();
        Map<String, Map<String, Object>> metricsByRouteId = new HashMap<>();
        String source = DEFAULT_SOURCE;
        if (summaryRows != null && !summaryRows.isEmpty()) {
            for (Map<String, Object> row : summaryRows) {
                Object rowId = row.get("route_id");
                if (rowId != null) {
                    metricsByRouteId.put(String.valueOf(rowId), row);
                }
            }
            Object firstSource = summaryRows.get(0).get("source");
            if (firstSource != null) {
                source = String.valueOf(firstSource);
            }
        }

        // ---- 根节点（字段序 = 契约根字段全集）----
        Map<String, Object> rootMetrics =
                metricsByRouteId.get(String.valueOf(root.getId()));
        Long rootHits = longOf(rootMetrics, "hits_24h");
        Double rootQps = doubleOf(rootMetrics, "qps");
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("hits_24h", rootHits != null ? rootHits : 0L);
        totals.put("qps", rootQps != null ? rootQps : 0.0d);

        Map<String, Object> node = new LinkedHashMap<>();
        node.put("route_id", String.valueOf(root.getId()));
        node.put("route_name", root.getRouteName());
        node.put("route_type", root.getRouteType());
        node.put("path", root.getPath());
        node.put("upstream_url", root.getUpstreamUrl());
        node.put("status", root.getStatus());
        // P2-2 多环境：null/blank 归一 default（与 RouteService.toTreeNode 同口径）
        node.put("environment", Route.environmentOr(root.getEnvironment()));
        node.put("max_depth", GatewayConstants.MAX_DISPATCH_DEPTH);
        node.put("source", source);
        node.put("totals", totals);

        TreeContext ctx = new TreeContext(routeMap, edgesByRoute, metricsByRouteId, new HashSet<>());
        ctx.visited().add(root.getId());
        node.put("children", expandChildren(ctx, root.getId(), 1));
        return node;
    }

    // ==================== 树构造 ====================

    /** 单次 decisionTree 调用的内存索引（3 次查询的 join 产物 + DFS 防环祖先集）。 */
    private record TreeContext(Map<Long, Route> routeMap,
                               Map<Long, List<RouteCondition>> edgesByRoute,
                               Map<String, Map<String, Object>> metricsByRouteId,
                               Set<Long> visited) {
    }

    /**
     * 展开某层的分支列表：只按「条件边的 target」生成（未被指向的路由不出现）。
     *
     * @param childDepth 本层分支所处深度（根的第 1 层 = 1）；&gt;
     *                   {@link GatewayConstants#MAX_DISPATCH_DEPTH} 时输出空数组、不再下钻
     */
    private List<Map<String, Object>> expandChildren(TreeContext ctx, Long routeId, int childDepth) {
        List<Map<String, Object>> children = new ArrayList<>();
        if (childDepth > GatewayConstants.MAX_DISPATCH_DEPTH) {
            return children;
        }
        List<RouteCondition> edges = ctx.edgesByRoute().getOrDefault(routeId, List.of());
        if (edges.isEmpty()) {
            return children;
        }
        // hit_ratio 分母 = 本层各边 target 的 hits_24h（null 按 0）之和；
        // 同一 target 多条边重复计入（字面口径）；分母 0 → 各边 0.0 不除零
        long denominator = 0L;
        for (RouteCondition edge : edges) {
            Long hits = hitsOf(ctx, edge.getTargetRouteId());
            denominator += hits != null ? hits : 0L;
        }
        for (RouteCondition edge : edges) {
            children.add(toBranchNode(ctx, edge, denominator, childDepth));
        }
        return children;
    }

    /** 单条条件边 → 分支节点（字段序 = 契约分支字段全集）。 */
    private Map<String, Object> toBranchNode(TreeContext ctx, RouteCondition edge,
                                             long denominator, int childDepth) {
        Long targetId = edge.getTargetRouteId();
        Route target = targetId == null ? null : ctx.routeMap().get(targetId);
        boolean nested = target != null && TYPE_DISPATCH.equals(target.getRouteType());

        Map<String, Object> node = new LinkedHashMap<>();
        node.put("target_route_id", targetId != null ? String.valueOf(targetId) : null);
        node.put("target_route_name", target != null ? target.getRouteName() : null);
        node.put("target_route_type", target != null ? target.getRouteType() : null);
        node.put("target_path", target != null ? target.getPath() : null);
        node.put("target_upstream_url", target != null ? target.getUpstreamUrl() : null);
        // 存在且 PUBLISHED 才可解析（DRAFT/OFFLINE/缺失 → false；与指标 join 互不影响）
        node.put("target_resolvable", target != null && STATUS_PUBLISHED.equals(target.getStatus()));
        node.put("is_nested", nested);
        node.put("priority", priorityOf(edge));

        Map<String, Object> condition = new LinkedHashMap<>();
        condition.put("condition_type", edge.getConditionType());
        condition.put("operator", edge.getOperator());
        condition.put("condition_key", edge.getConditionKey());
        condition.put("condition_value", edge.getConditionValue());
        node.put("condition", condition);

        // weight 仅 WEIGHT 边解析（admin 显示层口径：Integer 上限、超限 null；
        // 引擎侧该权重仍是 long 全域参与分流，勿把 null 当「无效」语义），其余边恒 null
        node.put("weight", TYPE_WEIGHT.equals(edge.getConditionType())
                ? parseWeight(edge.getConditionKey()) : null);

        Map<String, Object> metrics = targetId == null
                ? null : ctx.metricsByRouteId().get(String.valueOf(targetId));
        Long hits = longOf(metrics, "hits_24h");
        node.put("hits_24h", hits);
        node.put("qps", doubleOf(metrics, "qps"));
        node.put("p95_latency_ms", doubleOf(metrics, "p95_latency_ms"));
        long numerator = hits != null ? hits : 0L;
        node.put("hit_ratio", denominator == 0L ? 0.0d : (double) numerator / denominator);

        // 仅 DISPATCH 目标继续下钻；visited（祖先集）防环：回边节点保留但不再展开
        List<Map<String, Object>> kids = new ArrayList<>();
        if (nested && targetId != null && !ctx.visited().contains(targetId)) {
            ctx.visited().add(targetId);
            kids = expandChildren(ctx, targetId, childDepth + 1);
            ctx.visited().remove(targetId);
        }
        node.put("children", kids);
        return node;
    }

    // ==================== 工具 ====================

    /** priority null 防御按 0（排序与输出同口径）。 */
    private static int priorityOf(RouteCondition condition) {
        return condition.getPriority() != null ? condition.getPriority() : 0;
    }

    /**
     * WEIGHT 权重解析（admin 显示层口径）：trim 后正整数 &gt; 0 才显示，且收敛到
     * Integer 上限；空/非数字/小数/≤0/超 int 上限一律返回 null。
     *
     * <p>与引擎口径分层，勿混淆：引擎 {@code RouteDispatcher.parseWeight}
     * （gateway4j-engine）为 {@code Long.parseLong} 后 &gt;0 即有效，long 全域参与
     * 加权，超 int 上限的权重引擎会真实参与分流；本方法超限返 null 仅为显示层
     * 约束，不是「无效」的语义判定。若未来灰度滑杆放开大权重，需将本方法
     * widening 为 Long，并同步更新测试中 {@code assertInstanceOf(Integer.class)}
     * 的固化断言。</p>
     */
    private static Integer parseWeight(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        long parsed;
        try {
            parsed = Long.parseLong(trimmed);
        } catch (NumberFormatException e) {
            return null;
        }
        return parsed > 0 && parsed <= Integer.MAX_VALUE ? (int) parsed : null;
    }

    /** 边 target 的 hits_24h（target 缺失或 summary 无行 → null）。 */
    private static Long hitsOf(TreeContext ctx, Long targetId) {
        return targetId == null ? null
                : longOf(ctx.metricsByRouteId().get(String.valueOf(targetId)), "hits_24h");
    }

    /** 行内 long 值（缺失/行 null/非 Number → null；跨 JVM 序列化类型差异统一取 longValue）。 */
    private static Long longOf(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        return value instanceof Number number ? number.longValue() : null;
    }

    /** 行内 double 值（缺失/行 null/非 Number → null）。 */
    private static Double doubleOf(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        return value instanceof Number number ? number.doubleValue() : null;
    }
}
