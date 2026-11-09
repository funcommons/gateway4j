package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.MonitorTimeseriesService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteSimulateService;
import fun.commons.gateway4j.admin.service.RouteTrafficSummaryService;
import fun.commons.gateway4j.admin.service.UpstreamHealthProbe;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/v1/monitor")
@RequiresToken("BEARER")
public class MonitorController {

    private final RouteService routeService;
    private final RouteConditionMapper conditionMapper;
    private final MonitorTimeseriesService timeseriesService;
    private final RouteSimulateService routeSimulateService;
    private final RouteTrafficSummaryService trafficSummaryService;
    private final UpstreamHealthProbe upstreamHealthProbe;

    public MonitorController(RouteService routeService,
                             RouteConditionMapper conditionMapper,
                             MonitorTimeseriesService timeseriesService,
                             RouteSimulateService routeSimulateService,
                             RouteTrafficSummaryService trafficSummaryService,
                             UpstreamHealthProbe upstreamHealthProbe) {
        this.routeService = routeService;
        this.conditionMapper = conditionMapper;
        this.timeseriesService = timeseriesService;
        this.routeSimulateService = routeSimulateService;
        this.trafficSummaryService = trafficSummaryService;
        this.upstreamHealthProbe = upstreamHealthProbe;
    }

    @GetMapping("/routes/status")
    public List<Map<String, Object>> listRouteStatus(@RequestParam(name = "route_id", required = false) String routeId) {
        List<Route> routes;
        if (routeId != null) {
            Route route = routeService.getById(Long.valueOf(routeId));
            routes = route != null ? List.of(route) : List.of();
        } else {
            routes = routeService.listRoutes(null, null, null);
        }

        // P2-6：上游主动探测健康态一次性读全（HASH entries），行内按 route_id 取
        Map<String, Map<String, Object>> upstreamHealth = upstreamHealthProbe.readAll();

        List<Map<String, Object>> result = new ArrayList<>();
        for (Route route : routes) {
            Map<String, Object> status = buildStatus(route);
            // 可选扩展字段：探测未覆盖（非 PUBLISHED BACKEND）/HASH 过期时为 null
            status.put("upstream", upstreamHealth.get(String.valueOf(route.getId())));
            result.add(status);
        }
        return result;
    }

    /**
     * 路由流量聚合（v2 列表页聚合，见 docs/ui-v2/实施契约.md §4 S2）：
     * 近 24h hits/qps/p95/errors/状态码分布 + sparkline + 单上游健康，
     * Prometheus 优先、快照兜底，任何外部依赖异常不抛不 500。
     */
    @GetMapping("/routes/traffic-summary")
    public ApiResponse<List<Map<String, Object>>> routeTrafficSummary() {
        return ApiResponse.success(trafficSummaryService.summary());
    }

    /**
     * 路由模拟（P2-6 Debug 工具第一阶，Apigee Trace-lite）：只回答「这个请求会被
     * 谁接住、绑了哪些插件」，不做真实转发。匹配语义与数据面 DynamicRouteLocator
     * 逐字对齐（仅 PUBLISHED、PathPattern 匹配、DISPATCH 优先排序），DISPATCH 条件
     * 逐条求值输出 trace（BODY/GROOVY 跳过并说明），插件链装配预览三段返回。
     */
    @PostMapping("/route-simulate")
    public Map<String, Object> routeSimulate(@RequestBody RouteSimulateRequest request) {
        return routeSimulateService.simulate(request.path(), request.method(),
                request.headers(), request.query());
    }

    /**
     * 路由指标（兼容端点，响应形状不变：route_id/time_range/granularity/data_points）。
     * 时序合成本体已平移至 {@link MonitorTimeseriesService}（snapshot 路径复用），
     * Prometheus 优先的新端点见 {@link #timeseries}。
     */
    @GetMapping("/routes/{id}/metrics")
    public Map<String, Object> routeMetrics(@PathVariable Long id,
                                            @RequestParam(name = "time_range", defaultValue = "1h") String timeRange,
                                            @RequestParam(defaultValue = "1m") String granularity) {
        Route route = routeService.getById(id);
        String path = route != null ? route.getPath() : null;

        Map<String, Object> flat = timeseriesService.snapshotFlatPoints(path, timeRange, granularity);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("route_id", String.valueOf(id));
        result.put("time_range", flat.get("time_range"));
        result.put("granularity", flat.get("granularity"));
        result.put("data_points", flat.get("data_points"));
        return result;
    }

    /**
     * 路由指标时序（P1-6）：Prometheus 优先（gateway4j.monitor.prometheus-url 配置且
     * 可达时 source=prometheus），未配置/查询失败回退快照平铺（source=snapshot）。
     * 契约：{"source":"prometheus|snapshot","data_points":[{timestamp(ISO),
     * total_requests,error_count,error_rate,avg_latency_ms,p50/p95/p99_latency_ms}]}。
     */
    @GetMapping("/timeseries")
    public Map<String, Object> timeseries(@RequestParam Long routeId,
                                          @RequestParam(defaultValue = "1h") String timeRange,
                                          @RequestParam(defaultValue = "1m") String granularity) {
        return timeseriesService.timeseries(routeId, timeRange, granularity);
    }

    /**
     * 网关级聚合时序（P4b-2a，docs/ui-v2/实施契约.md §4 P4 表）：6 条 range query
     * 全部网关级 sum 单序列聚合（无 path 过滤/分组、无 routeId 输入），Prometheus
     * 优先、快照兜底，service 侧语义见
     * {@link MonitorTimeseriesService#gatewayTimeseries}。返回 ApiResponse.success
     * 信封（区别于旧 {@link #timeseries} 的裸 Map）；类级 {@code @RequiresToken}
     * 沿用。
     *
     * <p><b>quantile_fallback 两处语义区分（契约 S2/S8 双注记）</b>：本端点所属
     * timeseries 侧 {@code quantile_fallback=true} = p50/p95/p99 <b>按 avg 退化
     * 填充</b>（有值，可直接画线）；S2 traffic-summary 侧 p95 缺失 = null 占位
     * （前端须判空）。监控大盘 v2 的文案与判空逻辑不得混用两种语义。</p>
     */
    @GetMapping("/gateway/timeseries")
    public ApiResponse<Map<String, Object>> gatewayTimeseries(
            @RequestParam(name = "time_range", defaultValue = "1h") String timeRange,
            @RequestParam(name = "granularity", defaultValue = "1m") String granularity) {
        return ApiResponse.success(timeseriesService.gatewayTimeseries(timeRange, granularity));
    }

    @GetMapping("/topology")
    public Map<String, Object> getTopology() {
        List<Route> routes = routeService.listRoutes(null, null, null);
        List<RouteCondition> conditions = conditionMapper.selectList(null);

        Map<Long, Route> routeMap = new HashMap<>();
        for (Route route : routes) {
            routeMap.put(route.getId(), route);
        }

        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Route route : routes) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", String.valueOf(route.getId()));
            node.put("name", route.getRouteName());
            node.put("type", route.getRouteType());
            node.put("status", healthStatus(route));
            nodes.add(node);
        }

        List<Map<String, Object>> edges = new ArrayList<>();
        for (RouteCondition cond : conditions) {
            Route source = routeMap.get(cond.getRouteId());
            Route target = routeMap.get(cond.getTargetRouteId());
            if (source != null && target != null) {
                Map<String, Object> edge = new LinkedHashMap<>();
                edge.put("source_id", String.valueOf(cond.getRouteId()));
                edge.put("target_id", String.valueOf(cond.getTargetRouteId()));
                edge.put("condition", cond.getConditionType() + " " + cond.getOperator() + " "
                        + (cond.getConditionKey() != null ? cond.getConditionKey() : ""));
                edges.add(edge);
            }
        }

        return Map.of("nodes", nodes, "edges", edges);
    }

    private Map<String, Object> buildStatus(Route route) {
        MonitorTimeseriesService.PathMetrics metrics = timeseriesService.pathStatusMetrics(route.getPath());

        Map<String, Object> status = new LinkedHashMap<>();
        status.put("route_id", String.valueOf(route.getId()));
        status.put("route_name", route.getRouteName());
        status.put("status", metrics.total() > 0 && metrics.errorRate() > 0.05 ? "ERROR" : "HEALTHY");
        // P1-1：active_connections 不再硬编码 0 —— 读数据面指标快照的 active 字段
        // （在途请求数；旧版快照缺该字段时 MetricsSnapshotReader 回退 0）
        status.put("active_connections", metrics.active());
        status.put("total_requests", metrics.total());
        status.put("error_count", metrics.errors());
        status.put("error_rate", metrics.errorRate());
        return status;
    }

    private String healthStatus(Route route) {
        MonitorTimeseriesService.PathMetrics metrics = timeseriesService.pathStatusMetrics(route.getPath());
        if (metrics.total() > 0 && metrics.errorRate() > 0.05) {
            return "ERROR";
        }
        return "HEALTHY";
    }

    /** 路由模拟请求体（path 必填；headers/query 为 DISPATCH 条件求值输入）。 */
    public record RouteSimulateRequest(
            String path,
            String method,
            Map<String, String> headers,
            Map<String, String> query
    ) {}
}
