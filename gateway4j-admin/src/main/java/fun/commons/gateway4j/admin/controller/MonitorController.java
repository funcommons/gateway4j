package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/v1/monitor")
@RequiresToken("BEARER")
public class MonitorController {

    private final MeterRegistry meterRegistry;
    private final RouteService routeService;
    private final RouteConditionMapper conditionMapper;

    public MonitorController(MeterRegistry meterRegistry, RouteService routeService,
                             RouteConditionMapper conditionMapper) {
        this.meterRegistry = meterRegistry;
        this.routeService = routeService;
        this.conditionMapper = conditionMapper;
    }

    @GetMapping("/routes/status")
    public List<Map<String, Object>> listRouteStatus(@RequestParam(required = false) String routeId) {
        List<Route> routes;
        if (routeId != null) {
            Route route = routeService.getById(Long.valueOf(routeId));
            routes = route != null ? List.of(route) : List.of();
        } else {
            routes = routeService.listRoutes(null, null, null);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Route route : routes) {
            result.add(buildStatus(route));
        }
        return result;
    }

    @GetMapping("/routes/{id}/metrics")
    public Map<String, Object> routeMetrics(@PathVariable Long id,
                                            @RequestParam(defaultValue = "1h") String timeRange,
                                            @RequestParam(defaultValue = "1m") String granularity) {
        Route route = routeService.getById(id);
        String path = route != null ? route.getPath() : null;
        double total = path != null ? sumByPath(path, "requests.total") : 0;
        double errors = path != null ? sumByPath(path, "requests.errors") : 0;
        double avgLatency = path != null ? avgLatencyByPath(path) : 0;
        double[] percentiles = path != null ? latencyPercentilesByPath(path) : new double[]{0, 0, 0};

        int points = pointsFor(timeRange, granularity);
        long now = System.currentTimeMillis();
        long stepMs = stepMsFor(granularity);

        List<Map<String, Object>> dataPoints = new ArrayList<>();
        for (int i = points - 1; i >= 0; i--) {
            Map<String, Object> dp = new LinkedHashMap<>();
            dp.put("timestamp", now - (long) i * stepMs);
            dp.put("total_requests", (long) total);
            dp.put("error_count", (long) errors);
            dp.put("error_rate", total > 0 ? errors / total : 0.0);
            dp.put("avg_latency_ms", avgLatency);
            dp.put("p50_latency_ms", percentiles[0]);
            dp.put("p95_latency_ms", percentiles[1]);
            dp.put("p99_latency_ms", percentiles[2]);
            dataPoints.add(dp);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("route_id", String.valueOf(id));
        result.put("time_range", timeRange);
        result.put("granularity", granularity);
        result.put("data_points", dataPoints);
        return result;
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
        double total = sumByPath(route.getPath(), "requests.total");
        double errors = sumByPath(route.getPath(), "requests.errors");
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("route_id", String.valueOf(route.getId()));
        status.put("route_name", route.getRouteName());
        status.put("status", healthStatus(route));
        status.put("active_connections", 0);
        status.put("total_requests", (long) total);
        status.put("error_count", (long) errors);
        status.put("error_rate", total > 0 ? errors / total : 0.0);
        return status;
    }

    private String healthStatus(Route route) {
        double total = sumByPath(route.getPath(), "requests.total");
        double errors = sumByPath(route.getPath(), "requests.errors");
        if (total > 0 && errors / total > 0.05) {
            return "ERROR";
        }
        return "HEALTHY";
    }

    private double sumByPath(String path, String meterSuffix) {
        if (path == null) {
            return 0;
        }
        String normalized = normalizePath(path);
        double sum = 0;
        for (io.micrometer.core.instrument.Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith(meterSuffix)
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Counter counter) {
                sum += counter.count();
            }
        }
        return sum;
    }

    private double avgLatencyByPath(String path) {
        if (path == null) {
            return 0;
        }
        String normalized = normalizePath(path);
        double totalTime = 0;
        long count = 0;
        for (io.micrometer.core.instrument.Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith("request.latency")
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Timer timer) {
                totalTime += timer.totalTime(java.util.concurrent.TimeUnit.MILLISECONDS);
                count += timer.count();
            }
        }
        return count > 0 ? totalTime / count : 0;
    }

    private double[] latencyPercentilesByPath(String path) {
        String normalized = normalizePath(path);
        double p50 = 0, p95 = 0, p99 = 0;
        double totalTime = 0;
        long count = 0;
        for (io.micrometer.core.instrument.Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith("request.latency")
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Timer timer) {
                totalTime += timer.totalTime(java.util.concurrent.TimeUnit.MILLISECONDS);
                count += timer.count();
                try {
                    var snapshot = timer.takeSnapshot();
                    var values = snapshot.percentileValues();
                    if (values.length >= 3) {
                        p50 += values[0].value(java.util.concurrent.TimeUnit.MILLISECONDS);
                        p95 += values[1].value(java.util.concurrent.TimeUnit.MILLISECONDS);
                        p99 += values[2].value(java.util.concurrent.TimeUnit.MILLISECONDS);
                    }
                } catch (Exception ignored) {
                    // percentiles not published for this timer
                }
            }
        }
        if (p50 == 0 && p95 == 0 && p99 == 0) {
            double avg = count > 0 ? totalTime / count : 0;
            return new double[]{avg, avg, avg};
        }
        return new double[]{p50, p95, p99};
    }

    private int pointsFor(String timeRange, String granularity) {
        long rangeMs = rangeMsFor(timeRange);
        long stepMs = stepMsFor(granularity);
        int points = (int) Math.max(1, rangeMs / stepMs);
        return Math.min(points, 500);
    }

    private long rangeMsFor(String timeRange) {
        return switch (timeRange) {
            case "6h" -> 6 * 3600_000L;
            case "24h" -> 24 * 3600_000L;
            case "7d" -> 7 * 24 * 3600_000L;
            default -> 3600_000L;
        };
    }

    private long stepMsFor(String granularity) {
        return switch (granularity) {
            case "5m" -> 5 * 60_000L;
            case "1h" -> 3600_000L;
            default -> 60_000L;
        };
    }

    private String normalizePath(String path) {
        if (path == null) return "unknown";
        String normalized = path.replaceAll("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{id}");
        normalized = normalized.replaceAll("/\\d+", "/{id}");
        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
        }
        return normalized;
    }
}
