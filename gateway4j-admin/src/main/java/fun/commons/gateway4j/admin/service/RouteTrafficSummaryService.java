package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.model.Route;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * 路由流量聚合（UI v2 列表页，见 docs/ui-v2/实施契约.md §4 S2）：
 * 全量路由一次产出行级 hits_24h/qps/avg/p95/errors/状态码分布 + 上游健康。
 *
 * <p>P3 待办：30-60s 缓存（framework4j-cache）。</p>
 *
 * <p><b>source=prometheus</b>：可用性由 {@link MonitorTimeseriesService#isPrometheusConfigured()}
 * 与配置的 {@code gateway4j.monitor.prometheus-url} 共同判定。可用时对
 * {@code /api/v1/query} 发 <b>5 条全路由级瞬时查询</b>（不是逐路由 N 次），按
 * normalized path（数字段 → {@code {id}}，与 MetricsPlugin/MonitorTimeseriesService
 * 同款归一）内存 join：
 * <ol>
 * <li>hits_24h：{@code sum by (path) (increase(gateway4j_requests_total[24h]))}</li>
 * <li>qps：{@code sum by (path) (rate(gateway4j_requests_total[5m]))}</li>
 * <li>avg_latency_ms：{@code sum(rate(latency_seconds_sum[5m])) / sum(rate(latency_seconds_count[5m]))}
 *     （秒 → ms）</li>
 * <li>p95_latency_ms：直取客户端分位 gauge {@code max by (path)
 *     (gateway4j_request_latency_seconds{quantile="0.95"})} —— MetricsPlugin 的 Timer 走
 *     {@code publishPercentiles}，是客户端分位而非 histogram bucket，
 *     {@code histogram_quantile()} 不适用；quantile 序列缺失 → p95=null 且
 *     {@code quantile_fallback=true}（不退化 avg）；</li>
 * <li>status_codes：按 (path, status) 分桶 24h 增量 —— 见 {@link #PROM_STATUS_CODES}
 *     的指标选择说明（requests_total 无 status 标签，用 POST Timer count）。</li>
 * </ol></p>
 *
 * <p><b>归桶铁律</b>：status 标签 2 前缀 → {@code c2xx}；5 前缀 → {@code c5xx}；
 * 其余（4xx/3xx/非数字等未知值）一律归 {@code c4xx}（未知按错误保守记 4xx）。
 * errors 口径 = c4xx + c5xx，即除 2xx 外全部计入。</p>
 *
 * <p><b>source=snapshot</b>（降级铁律：单条查询失败 → warn → 该序列按空数据降级、
 * 其余照常；全部 5 条都失败 → 整表回退快照；全程不抛、绝不 500）：逐路由读
 * {@link MetricsSnapshotReader} 跨 JVM 快照（内部零抛，失败返回全 0 → 自然构成
 * 「数值 0 的基础行」）。快照是累计值：qps=0、p95=null、quantile_fallback=false
 * （该标志仅 Prometheus 模式使用）、avg=latency_ms_sum/latency_count、errors 无法
 * 拆分 4xx/5xx → 全记 c4xx、c2xx=total−errors。</p>
 *
 * <p>上游健康来自 {@link UpstreamHealthProbe#readAll()}（单 URL 探测，90s TTL，
 * 内部零抛）——按 route_id 取，未命中时 upstream=null 不报错（单上游端点语义，
 * 不存在多实例池）。route_id 用 String.valueOf（超大 Long 防 JS 精度丢失）；
 * 行内 "path" 为归一化 path；qps/avg 为 double，hits_24h/errors 为 long。</p>
 */
@Service
public class RouteTrafficSummaryService {

    private static final Logger log = LoggerFactory.getLogger(RouteTrafficSummaryService.class);

    /** Prometheus 瞬时查询条数（hits/qps/avg/p95/status_codes）；全败才回退快照。 */
    private static final int QUERY_COUNT = 5;

    /** 专用查询池线程命名序号。 */
    private static final AtomicInteger QUERY_THREAD_SEQ = new AtomicInteger();

    /**
     * 5 条瞬时查询专用有界池：固定 5 线程 = 单次聚合的查询条数，daemon 线程、命名
     * {@code gateway4j-traffic-query-N}，纯 JDK 实现、与 Spring 生命��期无关。
     *
     * <p>无需 @PreDestroy 关闭的理由：static 随 JVM 存活（Service 为单例，生命周期
     * 等同容器）；daemon 线程不阻止 JVM 退出；任务定长有界（单条 worst ≈ 7s，
     * 见 {@link #prometheusRows}），newFixedThreadPool 为无界队列不会拒绝任务，
     * 不存在线程/任务泄漏面。</p>
     */
    private static final ExecutorService QUERY_POOL = Executors.newFixedThreadPool(
            QUERY_COUNT,
            r -> {
                Thread thread = new Thread(
                        r, "gateway4j-traffic-query-" + QUERY_THREAD_SEQ.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            });

    /** 24h 命中量：窗口增量计数（值本身就是命中数，非速率）。 */
    static final String PROM_HITS_24H = "sum by (path) (increase(gateway4j_requests_total[24h]))";

    /** 近实时 QPS（5m 窗口速率，值即每秒请求数）。 */
    static final String PROM_QPS = "sum by (path) (rate(gateway4j_requests_total[5m]))";

    /** avg 延迟（秒）= sum 的 5m 速率 / count 的 5m 速率，与 qps 同窗口口径。 */
    static final String PROM_AVG = "sum by (path) (rate(gateway4j_request_latency_seconds_sum[5m]))"
            + " / sum by (path) (rate(gateway4j_request_latency_seconds_count[5m]))";

    /** p95 直取客户端分位 gauge（Timer publishPercentiles 发布，禁止 histogram_quantile）。 */
    static final String PROM_P95 = "max by (path) (gateway4j_request_latency_seconds{quantile=\"0.95\"})";

    /**
     * 状态码分布：全量请求按 (path, status) 的 24h 增量计数。
     *
     * <p>为何用 {@code gateway4j_request_latency_seconds_count} 而非
     * {@code gateway4j_requests_total}：后者是 PRE 阶段 Counter，只有 method/path
     * 标签（见 MetricsPlugin），是全库唯一无 status 维度的全量指标；唯一同时携带
     * status 且覆盖全部请求的是 POST 阶段 Timer 的 count（每个请求都会 record）。</p>
     */
    static final String PROM_STATUS_CODES =
            "sum by (path, status) (increase(gateway4j_request_latency_seconds_count[24h]))";

    private final RouteService routeService;
    private final MonitorTimeseriesService timeseriesService;
    private final UpstreamHealthProbe upstreamHealthProbe;
    private final MetricsSnapshotReader snapshotReader;
    private final ObjectMapper objectMapper;
    private final String prometheusUrl;
    private final RestClient prometheusClient;

    public RouteTrafficSummaryService(RouteService routeService,
                                      MonitorTimeseriesService timeseriesService,
                                      UpstreamHealthProbe upstreamHealthProbe,
                                      MetricsSnapshotReader snapshotReader,
                                      ObjectMapper objectMapper,
                                      @Value("${gateway4j.monitor.prometheus-url:}") String prometheusUrl) {
        this.routeService = routeService;
        this.timeseriesService = timeseriesService;
        this.upstreamHealthProbe = upstreamHealthProbe;
        this.snapshotReader = snapshotReader;
        this.objectMapper = objectMapper;
        this.prometheusUrl = prometheusUrl == null ? "" : prometheusUrl.trim();
        this.prometheusClient = buildPrometheusClient();
    }

    /**
     * 聚合主入口。行序按 hits_24h 降序（原型「按命中量排序」），并列按 route_id 升序。
     * 除「查路由列表本身」外的任何外部依赖异常都在此吞掉降级，绝不向上抛。
     */
    public List<Map<String, Object>> summary() {
        List<Route> routes = routeService.listRoutes(null, null, null);
        // 一次性读全上游健康态（HASH entries，内部零抛；Redis 拒连 → 空 Map → upstream=null）
        Map<String, Map<String, Object>> upstreamHealth = upstreamHealthProbe.readAll();

        if (timeseriesService.isPrometheusConfigured() && !prometheusUrl.isEmpty()) {
            try {
                return prometheusRows(routes, upstreamHealth);
            } catch (Exception e) {
                // 任何 Prometheus 异常（拒连/超时/非 200/查询错误）→ 整表回退快照，绝不 500
                log.warn("[路由流量聚合] Prometheus 查询失败（url={}），整表回退快照: {}",
                        prometheusUrl, e.getMessage());
            }
        }
        return snapshotRows(routes, upstreamHealth);
    }

    // ==================== source=prometheus ====================

    /**
     * 5 条全路由级瞬时查询<b>并行发射</b> + 内存按 normalized path join 组行（一次循环
     * 发齐，查询次数与路由数无关）。
     *
     * <p><b>为何并行</b>：单条查询 worst ≈ connect 2s + read 5s = 7s，串行 5 条最坏
     * 35s，超过前端 axios 30s 超时（半健康态直接请求失败）；并行后整表 worst ≈ 单条
     * 最坏 7s。必须先发齐 5 个 future 再逐个 join（发一条等一条会退化回串行）。</p>
     *
     * <p><b>线程安全</b>：RestClient（每次请求独立连接）/ObjectMapper/SLF4J 均可并发；
     * 每个 future 各自返回私有 Map，join 后由主线程汇总；唯一共享可变容器 {@code failed}
     * 用并发安全集合收集（worker 线程 add、join 后主线程读 size）。</p>
     *
     * <p>容错分层（语义不变）：单条查询失败（拒连/超时/非 200/查询错误/坏响应）→
     * warn → 该序列按空数据处理，其余序列照常（source 仍为 prometheus）；<b>全部 5 条</b>
     * 都失败才抛出 → 由 {@link #summary()} 整表回退快照。</p>
     */
    private List<Map<String, Object>> prometheusRows(List<Route> routes,
                                                     Map<String, Map<String, Object>> upstreamHealth)
            throws Exception {
        Set<String> failed = ConcurrentHashMap.newKeySet();
        CompletableFuture<Map<String, Double>> hits =
                submitQuery(PROM_HITS_24H, "hits_24h", failed, this::extractInstant);
        CompletableFuture<Map<String, Double>> qps =
                submitQuery(PROM_QPS, "qps", failed, this::extractInstant);
        CompletableFuture<Map<String, Double>> avg =
                submitQuery(PROM_AVG, "avg_latency_ms", failed, this::extractInstant);
        CompletableFuture<Map<String, Double>> p95 =
                submitQuery(PROM_P95, "p95_latency_ms", failed, this::extractInstant);
        CompletableFuture<Map<String, Map<String, Double>>> status =
                submitQuery(PROM_STATUS_CODES, "status_codes", failed, this::extractStatusSeries);
        // 全部提交后才阻塞 join；join 不抛业务异常（tryQuery 已在 worker 线程内降级为空 Map）
        Map<String, Double> hitsByPath = hits.join();
        Map<String, Double> qpsByPath = qps.join();
        Map<String, Double> avgByPath = avg.join();
        Map<String, Double> p95ByPath = p95.join();
        Map<String, Map<String, Double>> statusByPath = status.join();
        if (failed.size() == QUERY_COUNT) {
            throw new IllegalStateException("Prometheus 全部查询失败，整表回退快照");
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Route route : routes) {
            String normalized = normalizePath(route.getPath());
            Double avgSec = avgByPath.get(normalized);
            Double p95Sec = p95ByPath.get(normalized);

            long[] codes = bucketStatus(statusByPath.getOrDefault(normalized, Map.of()));
            Map<String, Object> distribution = new LinkedHashMap<>();
            distribution.put("c2xx", codes[0]);
            distribution.put("c4xx", codes[1]);
            distribution.put("c5xx", codes[2]);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("route_id", String.valueOf(route.getId()));
            row.put("route_name", route.getRouteName());
            row.put("route_type", route.getRouteType());
            row.put("path", normalized);
            row.put("status", route.getStatus());
            row.put("hits_24h", Math.round(hitsByPath.getOrDefault(normalized, 0d)));
            row.put("qps", round3(qpsByPath.getOrDefault(normalized, 0d)));
            row.put("avg_latency_ms", avgSec != null ? round3(avgSec * 1000d) : 0d);
            row.put("p95_latency_ms", p95Sec != null ? round3(p95Sec * 1000d) : null);
            row.put("errors", codes[1] + codes[2]);
            row.put("status_codes", distribution);
            // 探测未覆盖（非 PUBLISHED BACKEND）/HASH 过期 → null，不报错（同 /routes/status 口径）
            row.put("upstream", upstreamHealth.get(String.valueOf(route.getId())));
            row.put("source", "prometheus");
            row.put("quantile_fallback", p95Sec == null);
            rows.add(row);
        }
        rows.sort(this::byHitsDesc);
        return rows;
    }

    // ==================== source=snapshot（降级） ====================

    /**
     * 快照兜底：逐路由读跨 JVM 快照（内部零抛，失败即全 0 基础行）。
     * 快照为累计值，无速率/分位/status 维度，相应字段按 0/null/false 降级。
     */
    private List<Map<String, Object>> snapshotRows(List<Route> routes,
                                                   Map<String, Map<String, Object>> upstreamHealth) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Route route : routes) {
            String normalized = normalizePath(route.getPath());
            MetricsSnapshotReader.MetricsSnapshot snapshot = snapshotReader.readByPath(normalized);
            double avgMs = snapshot.latencyCount() > 0
                    ? snapshot.latencyMsSum() / snapshot.latencyCount() : 0d;

            // 快照 errors 是 4xx/5xx 合计、无法拆分 → 全记 c4xx，c2xx = total − errors
            long errors = snapshot.errors();
            long c2xx = Math.max(0L, snapshot.total() - errors);
            Map<String, Object> distribution = new LinkedHashMap<>();
            distribution.put("c2xx", c2xx);
            distribution.put("c4xx", errors);
            distribution.put("c5xx", 0L);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("route_id", String.valueOf(route.getId()));
            row.put("route_name", route.getRouteName());
            row.put("route_type", route.getRouteType());
            row.put("path", normalized);
            row.put("status", route.getStatus());
            row.put("hits_24h", snapshot.total());
            row.put("qps", 0d);
            row.put("avg_latency_ms", round3(avgMs));
            row.put("p95_latency_ms", null);
            row.put("errors", errors);
            row.put("status_codes", distribution);
            row.put("upstream", upstreamHealth.get(String.valueOf(route.getId())));
            row.put("source", "snapshot");
            // quantile_fallback 仅 Prometheus 模式标注 quantile 序列缺失，快照模式恒 false
            row.put("quantile_fallback", Boolean.FALSE);
            rows.add(row);
        }
        rows.sort(this::byHitsDesc);
        return rows;
    }

    // ==================== Prometheus 查询与解析 ====================

    /** 独立 RestClient：连接 2s / 读取 5s（与 MonitorTimeseriesService 同款超时口径）。 */
    private static RestClient buildPrometheusClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return RestClient.builder().requestFactory(factory).build();
    }

    /**
     * 单条查询提交到 {@link #QUERY_POOL} 并行执行；降级约定仍在 {@link #tryQuery} 内
     * 完成（worker 线程 catch 一切异常 → 空 Map），故 {@code join()} 永不因业务异常抛出。
     * 失败序列名并发安全地记入 {@code failed}，由调用方在全部 join 后聚合。
     */
    private <K, V> CompletableFuture<Map<K, V>> submitQuery(String query, String name,
                                                            Set<String> failed,
                                                            Function<JsonNode, Map<K, V>> extractor) {
        return CompletableFuture.supplyAsync(() -> tryQuery(query, name, failed, extractor), QUERY_POOL);
    }

    /**
     * 单条查询独立降级（运行于 QUERY_POOL worker 线程）：失败 → warn → 记入 failed
     * （并发安全集合，调用方 join 后读取）并返回空 Map（视为无数据，不拖垮其余序列）。
     * 全部查询都失败时由调用方决定整表回退快照。
     */
    private <K, V> Map<K, V> tryQuery(String query, String name, Set<String> failed,
                                      Function<JsonNode, Map<K, V>> extractor) {
        try {
            return extractor.apply(instantQuery(query));
        } catch (Exception e) {
            failed.add(name);
            log.warn("[路由流量聚合] Prometheus 查询 {} 失败，按无数据处理: {}", name, e.getMessage());
            return Map.of();
        }
    }

    /** instant query：GET {prometheus-url}/api/v1/query?query=...，返回 data.result。 */
    private JsonNode instantQuery(String query) throws Exception {
        URI uri = UriComponentsBuilder.fromHttpUrl(prometheusUrl)
                .path("/api/v1/query")
                .queryParam("query", query)
                .build()
                .encode()
                .toUri();
        ResponseEntity<String> entity = prometheusClient.get().uri(uri).retrieve().toEntity(String.class);
        if (!entity.getStatusCode().is2xxSuccessful() || entity.getBody() == null
                || entity.getBody().isBlank()) {
            throw new IllegalStateException("Prometheus 响应异常: HTTP " + entity.getStatusCode());
        }
        JsonNode root = objectMapper.readTree(entity.getBody());
        // body 是 "null"/空对象（空响应）→ 视为该查询无数据，返回 NullNode（下游循环零次），
        // 不抛：个别序列缺失不应拖垮整表
        if (root == null || root.isNull() || root.isMissingNode()) {
            return root;
        }
        if (!"success".equals(root.path("status").asText())) {
            throw new IllegalStateException("Prometheus 查询失败: " + root.path("error").asText(""));
        }
        return root.path("data").path("result");
    }

    /** instant vector → path → value（sum/max by (path) 保证每 path 单序列）。 */
    private Map<String, Double> extractInstant(JsonNode result) {
        Map<String, Double> out = new HashMap<>();
        for (JsonNode series : result) {
            String path = series.path("metric").path("path").asText("");
            JsonNode sample = series.path("value");
            if (path.isEmpty() || !sample.isArray() || sample.size() < 2) {
                continue;
            }
            out.put(path, sample.get(1).asDouble(0d));
        }
        return out;
    }

    /** instant vector → path → (status → 增量计数)。status 标签缺失按 "unknown" 归桶。 */
    private Map<String, Map<String, Double>> extractStatusSeries(JsonNode result) {
        Map<String, Map<String, Double>> out = new HashMap<>();
        for (JsonNode series : result) {
            String path = series.path("metric").path("path").asText("");
            String status = series.path("metric").path("status").asText("unknown");
            JsonNode sample = series.path("value");
            if (path.isEmpty() || !sample.isArray() || sample.size() < 2) {
                continue;
            }
            out.computeIfAbsent(path, k -> new LinkedHashMap<>())
                    .put(status, sample.get(1).asDouble(0d));
        }
        return out;
    }

    /**
     * 归桶铁律：2 前缀 → c2xx；5 前缀 → c5xx；其余（4xx/3xx/非数字等未知）一律归
     * c4xx（未知按错误保守记 4xx）。返回 [c2xx, c4xx, c5xx]。
     */
    private long[] bucketStatus(Map<String, Double> statusRates) {
        long c2xx = 0;
        long c4xx = 0;
        long c5xx = 0;
        for (Map.Entry<String, Double> entry : statusRates.entrySet()) {
            long count = Math.round(entry.getValue());
            String status = entry.getKey();
            if (status.startsWith("2")) {
                c2xx += count;
            } else if (status.startsWith("5")) {
                c5xx += count;
            } else {
                c4xx += count;
            }
        }
        return new long[]{c2xx, c4xx, c5xx};
    }

    // ==================== 工具 ====================

    /**
     * 与 MetricsPlugin（数据面）/MonitorTimeseriesService 同款 path 归一：UUID 段与
     * 数字段 → {@code {id}}，超长截断 100。独立副本：测试中 timeseriesService 为
     * Mockito mock 不可调用，且管理台/数据面两侧必须逐字一致。
     */
    static String normalizePath(String path) {
        if (path == null) return "unknown";
        String normalized = path.replaceAll("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{id}");
        normalized = normalized.replaceAll("/\\d+", "/{id}");
        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
        }
        return normalized;
    }

    /** hits_24h 降序（并列按 route_id 升序，保证幂等行序）。 */
    private int byHitsDesc(Map<String, Object> left, Map<String, Object> right) {
        long leftHits = ((Number) left.get("hits_24h")).longValue();
        long rightHits = ((Number) right.get("hits_24h")).longValue();
        if (leftHits != rightHits) {
            return leftHits > rightHits ? -1 : 1;
        }
        return String.valueOf(left.get("route_id")).compareTo(String.valueOf(right.get("route_id")));
    }

    private double round3(double v) {
        return Math.round(v * 1000d) / 1000d;
    }
}
