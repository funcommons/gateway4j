package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.model.Route;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 路由指标时序（P1-6）：Prometheus 优先，快照平铺兜底。
 *
 * <p><b>source=prometheus</b>：配置 {@code gateway4j.monitor.prometheus-url} 且可达时，
 * 走 Prometheus HTTP API range query（{@code /api/v1/query_range}），
 * {@code sum by (path)} 聚合 {@code gateway4j_requests_total} /
 * {@code gateway4j_requests_errors}，分位数取 MetricsPlugin Timer
 * {@code publishPercentiles(0.5,0.95,0.99)} 发布的客户端分位 gauge
 * {@code gateway4j_request_latency_seconds{quantile="..."}} —— 该 Timer 是
 * 客户端分位而非 histogram bucket，{@code histogram_quantile()} 不适用；
 * 某 quantile 序列缺失时该分位退化为 avg（响应整体带
 * {@code quantile_fallback=true} 标注）。</p>
 *
 * <p><b>source=snapshot</b>：未配置 Prometheus / 查询失败时回退到
 * 本地 MeterRegistry + Redis 指标快照（{@link MetricsSnapshotReader}）的平铺逻辑
 * （原 {@code GET /v1/monitor/routes/{id}/metrics} 的实现，平移至此复用），
 * 时间戳为 ISO-8601 字符串。</p>
 *
 * <p>任何 Prometheus 异常（拒连/超时/非 200/坏 JSON）都不抛出——记 warn 后静默
 * 回退 snapshot，监控接口绝不 500。</p>
 */
@Service
public class MonitorTimeseriesService {

    private static final Logger log = LoggerFactory.getLogger(MonitorTimeseriesService.class);

    private static final String METER_TOTAL_SUFFIX = ".requests.total";
    private static final String METER_ERRORS_SUFFIX = ".requests.errors";
    private static final String METER_LATENCY_SUFFIX = ".request.latency";

    private final RouteService routeService;
    private final MeterRegistry meterRegistry;
    private final MetricsSnapshotReader snapshotReader;
    private final ObjectMapper objectMapper;
    private final String prometheusUrl;
    private final RestClient prometheusClient;

    public MonitorTimeseriesService(RouteService routeService,
                                    MeterRegistry meterRegistry,
                                    MetricsSnapshotReader snapshotReader,
                                    ObjectMapper objectMapper,
                                    @Value("${gateway4j.monitor.prometheus-url:}") String prometheusUrl) {
        this.routeService = routeService;
        this.meterRegistry = meterRegistry;
        this.snapshotReader = snapshotReader;
        this.objectMapper = objectMapper;
        this.prometheusUrl = prometheusUrl == null ? "" : prometheusUrl.trim();
        this.prometheusClient = buildPrometheusClient();
    }

    /** 未配置 prometheus-url（空）= 快照兜底（前端与 e2e 的可预期回退路径）。 */
    public boolean isPrometheusConfigured() {
        return !prometheusUrl.isEmpty();
    }

    /**
     * 时序主入口。返回契约：{"source":"prometheus|snapshot","data_points":[...]}，
     * data_points 元素 8 字段：timestamp(ISO-8601)/total_requests/error_count/error_rate/
     * avg_latency_ms/p50_latency_ms/p95_latency_ms/p99_latency_ms。
     */
    public Map<String, Object> timeseries(Long routeId, String timeRange, String granularity) {
        Route route = routeService.getById(routeId);
        String path = route != null ? route.getPath() : null;
        String normalized = normalizePath(path);

        Map<String, Object> result = new LinkedHashMap<>();
        if (isPrometheusConfigured()) {
            try {
                result.put("source", "prometheus");
                var prometheusResult = queryPrometheus(normalized, timeRange, granularity);
                result.put("data_points", prometheusResult.getValue());
                // quantile 序列缺失 → 该分位已按 avg 退化（任务口径：在返回中标注）
                if (prometheusResult.getKey()) {
                    result.put("quantile_fallback", true);
                }
                return result;
            } catch (Exception e) {
                // 查询失败 → 快照回退，绝不 500
                log.warn("[指标时序] Prometheus 查询失败（url={} path={}），回退快照: {}",
                        prometheusUrl, normalized, e.getMessage());
            }
        }
        result.put("source", "snapshot");
        result.put("data_points", snapshotDataPoints(normalized, timeRange, granularity));
        return result;
    }

    // ==================== 快照兜底（原 /metrics 平铺逻辑平移） ====================

    /** 路由状态条（大盘卡片）合成指标：本地注册表 + Redis 快照一次读齐。 */
    public record PathMetrics(long total, long errors, double errorRate, long active) {}

    /**
     * 大盘路由状态用合成指标（P1-1：active 来自快照 active 字段，旧快照缺字段回退 0）。
     */
    public PathMetrics pathStatusMetrics(String path) {
        PathSample sample = sampleByPath(normalizePath(path));
        double total = sample.total;
        double errors = sample.errors;
        return new PathMetrics(Math.round(total), Math.round(errors),
                total > 0 ? errors / total : 0.0, sample.snapshot.active());
    }

    /** 本地注册表 + 单次快照读取合成的一组分量（避免每字段各读一遍 Redis）。 */
    private record PathSample(double total, double errors, double avgLatencyMs,
                              double[] percentiles, MetricsSnapshotReader.MetricsSnapshot snapshot) {}

    private PathSample sampleByPath(String normalized) {
        MetricsSnapshotReader.MetricsSnapshot snapshot = snapshotReader.readByPath(normalized);
        // 跨 JVM 兜底：本 JVM（管理台）没有流量，真实指标在数据面 JVM，由
        // MetricsSnapshotPublisher 每 5s 写入 Redis。生产中两者互斥（数据面走本地、
        // 管理台走快照），相加无双算风险；快照不可用时返回全 0。
        double total = localCounterSum(normalized, METER_TOTAL_SUFFIX) + snapshot.total();
        double errors = localCounterSum(normalized, METER_ERRORS_SUFFIX) + snapshot.errors();
        double localTotalTime = 0;
        long localCount = 0;
        for (Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith(METER_LATENCY_SUFFIX)
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Timer timer) {
                localTotalTime += timer.totalTime(java.util.concurrent.TimeUnit.MILLISECONDS);
                localCount += timer.count();
            }
        }
        // 均值口径：分子/分母同时叠加快照分量（跨 JVM 合成）
        double totalTime = localTotalTime + snapshot.latencyMsSum();
        long count = localCount + snapshot.latencyCount();
        double avgLatency = count > 0 ? totalTime / count : 0;
        // 分位数回退口径保持旧 /metrics 行为：仅用本地注册表分量（快照无分位数据）
        return new PathSample(total, errors, avgLatency,
                latencyPercentilesByPath(normalized, localTotalTime, localCount), snapshot);
    }

    private double localCounterSum(String normalized, String meterSuffix) {
        double sum = 0;
        for (Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith(meterSuffix)
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Counter counter) {
                sum += counter.count();
            }
        }
        return sum;
    }

    /**
     * 快照平铺：区间内每个粒度点都填同一份「当前累计值」（本地注册表 + Redis 快照
     * 合成），timestamp 为 ISO-8601 字符串。返回 {time_range, granularity, data_points}。
     */
    public Map<String, Object> snapshotFlatPoints(String path, String timeRange, String granularity) {
        String normalized = normalizePath(path);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("time_range", timeRange);
        result.put("granularity", granularity);
        result.put("data_points", snapshotDataPoints(normalized, timeRange, granularity));
        return result;
    }

    private List<Map<String, Object>> snapshotDataPoints(String normalized, String timeRange, String granularity) {
        PathSample sample = sampleByPath(normalized);
        double total = sample.total;
        double errors = sample.errors;
        double avgLatency = sample.avgLatencyMs;
        double[] percentiles = sample.percentiles;

        int points = pointsFor(timeRange, granularity);
        long now = System.currentTimeMillis();
        long stepMs = stepMsFor(granularity);

        List<Map<String, Object>> dataPoints = new ArrayList<>();
        for (int i = points - 1; i >= 0; i--) {
            Map<String, Object> dp = new LinkedHashMap<>();
            // ISO-8601 字符串（带时区语义）：前端 new Date(iso) 直解；裸 epoch 毫秒被
            // framework4j Long→String 契约序列化成 "1793..." 后 new Date(str) 是 Invalid Date
            dp.put("timestamp", Instant.ofEpochMilli(now - (long) i * stepMs).toString());
            dp.put("total_requests", (long) total);
            dp.put("error_count", (long) errors);
            dp.put("error_rate", total > 0 ? errors / total : 0.0);
            dp.put("avg_latency_ms", avgLatency);
            dp.put("p50_latency_ms", percentiles[0]);
            dp.put("p95_latency_ms", percentiles[1]);
            dp.put("p99_latency_ms", percentiles[2]);
            dataPoints.add(dp);
        }
        return dataPoints;
    }

    private double[] latencyPercentilesByPath(String normalized, double totalTime, long count) {
        // Redis 快照只有总耗时/次数分量，没有分位数 → 本地注册表无分位数据时
        // p50/p95/p99 降级为 avg（可接受的降级）
        double p50 = 0, p95 = 0, p99 = 0;
        for (Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith(METER_LATENCY_SUFFIX)
                    && normalized.equals(meter.getId().getTag("path"))
                    && meter instanceof Timer timer) {
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

    private double[] latencyPercentilesByPath(String normalized) {
        // Redis 快照只有总耗时/次数分量，没有分位数 → 本地注册表无数据时
        // p50/p95/p99 只能降级为 avg（可接受的降级）
        double p50 = 0, p95 = 0, p99 = 0;
        double totalTime = 0;
        long count = 0;
        for (Meter meter : meterRegistry.getMeters()) {
            if (meter.getId().getName().endsWith(METER_LATENCY_SUFFIX)
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

    // ==================== Prometheus 优先 ====================

    private RestClient buildPrometheusClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return RestClient.builder().requestFactory(factory).build();
    }

    /**
     * range query 并按时间戳对齐合并。MetricsPlugin 的 latency Timer 走
     * publishPercentiles（客户端分位 gauge，非 histogram bucket），因此分位查询用
     * {@code gateway4j_request_latency_seconds{quantile="x"}} 直取；
     * 缺 quantile 序列时该分位以 avg 退化并在响应顶层标注 quantile_fallback=true。
     */
    /** @return key=quantile 是否退化（缺 quantile 序列），value=data_points */
    private Map.Entry<Boolean, List<Map<String, Object>>> queryPrometheus(String normalized, String timeRange,
                                                                          String granularity) throws Exception {
        long rangeMs = rangeMsFor(timeRange);
        long stepMs = stepMsFor(granularity);
        long endSec = System.currentTimeMillis() / 1000;
        long startSec = endSec - rangeMs / 1000;
        String stepSec = String.valueOf(Math.max(1, stepMs / 1000));

        TreeMap<Long, Point> grid = new TreeMap<>();
        mergeRange(grid, rangeQuery("sum by (path) (gateway4j_requests_total"
                + labelFilter(normalized) + ")", startSec, endSec, stepSec),
                (p, v) -> p.total = Math.round(v));
        mergeRange(grid, rangeQuery("sum by (path) (gateway4j_requests_errors"
                + labelFilter(normalized) + ")", startSec, endSec, stepSec),
                (p, v) -> p.errors = Math.round(v));
        mergeRange(grid, rangeQuery(avgLatencyQuery(normalized, Math.max(2 * stepMs / 1000, 120)),
                startSec, endSec, stepSec), (p, v) -> p.avg = v * 1000d);
        mergeRange(grid, rangeQuery(quantileQuery(normalized, "0.5"), startSec, endSec, stepSec),
                (p, v) -> p.p50 = v * 1000d);
        mergeRange(grid, rangeQuery(quantileQuery(normalized, "0.95"), startSec, endSec, stepSec),
                (p, v) -> p.p95 = v * 1000d);
        mergeRange(grid, rangeQuery(quantileQuery(normalized, "0.99"), startSec, endSec, stepSec),
                (p, v) -> p.p99 = v * 1000d);
        boolean quantileFallback = grid.values().stream()
                .anyMatch(p -> p.p50 == null || p.p95 == null || p.p99 == null);

        List<Map<String, Object>> dataPoints = new ArrayList<>();
        for (Map.Entry<Long, Point> entry : grid.entrySet()) {
            Point p = entry.getValue();
            if (quantileFallback) {
                double avg = p.avg;
                if (p.p50 == null) p.p50 = avg;
                if (p.p95 == null) p.p95 = avg;
                if (p.p99 == null) p.p99 = avg;
            }
            Map<String, Object> dp = new LinkedHashMap<>();
            dp.put("timestamp", Instant.ofEpochMilli(entry.getKey()).toString());
            dp.put("total_requests", p.total);
            dp.put("error_count", p.errors);
            dp.put("error_rate", p.total > 0 ? p.errors / (double) p.total : 0.0);
            dp.put("avg_latency_ms", round3(p.avg));
            dp.put("p50_latency_ms", round3(p.p50 == null ? p.avg : p.p50));
            dp.put("p95_latency_ms", round3(p.p95 == null ? p.avg : p.p95));
            dp.put("p99_latency_ms", round3(p.p99 == null ? p.avg : p.p99));
            dataPoints.add(dp);
        }
        if (dataPoints.isEmpty()) {
            // Prometheus 可达但区间无任何序列 → 补齐 step 网格零点，保持返回形状稳定
            return Map.entry(false, snapshotDataPoints(normalized, timeRange, granularity));
        }
        if (quantileFallback) {
            log.info("[指标时序] Prometheus 分位序列缺失，p50/p95/p99 已按 avg 退化（path={}）", normalized);
        }
        return Map.entry(quantileFallback, dataPoints);
    }

    private void mergeRange(TreeMap<Long, Point> grid, JsonNode matrix,
                            java.util.function.BiConsumer<Point, Double> setter) {
        for (JsonNode series : matrix) {
            for (JsonNode sample : series.path("values")) {
                long ts = (long) (sample.get(0).asDouble() * 1000d);
                double val = sample.get(1).asDouble(0d);
                setter.accept(grid.computeIfAbsent(ts, k -> new Point()), val);
            }
        }
    }

    private JsonNode rangeQuery(String query, long startSec, long endSec, String stepSec) throws Exception {
        URI uri = UriComponentsBuilder.fromHttpUrl(prometheusUrl)
                .path("/api/v1/query_range")
                .queryParam("query", query)
                .queryParam("start", startSec)
                .queryParam("end", endSec)
                .queryParam("step", stepSec)
                .build()
                .encode()
                .toUri();
        ResponseEntity<String> entity = prometheusClient.get().uri(uri).retrieve().toEntity(String.class);
        if (!entity.getStatusCode().is2xxSuccessful() || entity.getBody() == null) {
            throw new IllegalStateException("Prometheus 响应异常: HTTP " + entity.getStatusCode());
        }
        JsonNode root = objectMapper.readTree(entity.getBody());
        if (!"success".equals(root.path("status").asText())) {
            throw new IllegalStateException("Prometheus 查询失败: " + root.path("error").asText(""));
        }
        return root.path("data").path("result");
    }

    /** sum by (path) 后再按 path 精确过滤（与 MetricsPlugin 的 path tag 原文一致）。 */
    private String labelFilter(String normalized) {
        return "{path=\"" + normalized.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
    }

    /**
     * avg 延迟（秒）= sum 的 rate / count 的 rate，窗口取 max(2×step, 2m)。
     */
    private String avgLatencyQuery(String normalized, long rateWindowSec) {
        String w = "[" + rateWindowSec + "s]";
        String filter = labelFilter(normalized);
        return "sum by (path) (rate(gateway4j_request_latency_seconds_sum" + filter + w + "))"
                + " / sum by (path) (rate(gateway4j_request_latency_seconds_count" + filter + w + "))";
    }

    private String quantileQuery(String normalized, String quantile) {
        return "max by (path) (gateway4j_request_latency_seconds"
                + labelFilter(normalized).replace("}", ",quantile=\"" + quantile + "\"}") + ")";
    }

    /** quantile 过滤写在 labelFilter 花括号里：{path="..."} → {path="...",quantile="0.5"}。 */
    private static final class Point {
        private long total;
        private long errors;
        private double avg;
        private Double p50;
        private Double p95;
        private Double p99;
    }

    private double round3(double v) {
        return Math.round(v * 1000d) / 1000d;
    }

    // ==================== 与旧 /metrics 相同的网格与归一工具 ====================

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
