package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * P4b-2a 网关级聚合时序（docs/ui-v2/实施契约.md §4.5 P4 表 P4b-2a）：
 * {@code MonitorTimeseriesService} 新增网关级入口 —— 现有 6 序列 query_range
 * <b>去掉 path 过滤</b>即网关级聚合。纯 JUnit5 单测，Prometheus 用本机
 * HttpServer mock（{@link MonitorTimeseriesServiceTest} 同款）。
 *
 * <p><b>测试先行</b>：被测方法尚未实现时本文件使 admin 测试编译失败 —— 预期 RED，
 * C-agent 按本文件实现后由 R-agent 跑绿。</p>
 *
 * <p><b>期望方法签名</b>（挂在既有 {@code MonitorTimeseriesService} 上，构造器不变）：
 * <pre>
 * public Map&lt;String, Object&gt; gatewayTimeseries(String timeRange, String granularity)
 * </pre>
 * 返回契约与 {@code timeseries(Long, String, String)} 一致：
 * {@code {source: prometheus|snapshot, data_points: [8 字段], quantile_fallback 仅退化时出现}}；
 * data_points 元素 8 字段：timestamp(ISO-8601)/total_requests/error_count/error_rate/
 * avg_latency_ms/p50_latency_ms/p95_latency_ms/p99_latency_ms。</p>
 *
 * <p><b>网关级聚合铁律（与带 routeId 版本的区别点）</b>：全部 6 条 range query
 * 均为<b>网关级单序列聚合</b> —— 查询串不得出现任何 {@code path} 引用：不含 path
 * 过滤（{@code path="..."}）、不含 path 分组（{@code sum by (path)}）、不含路由
 * 路径归一产物（{@code {id}}）。若保留 {@code by (path)}，mergeRange 按时间戳
 * assign 语义会在多 path 序列间互相覆盖，total 退化为任意单 path 值 —— 必须网关级
 * sum。网关级无 routeId 输入，Prometheus 成功路径不得触达 RouteService。</p>
 *
 * <p><b>粒度映射照旧</b>：rangeMsFor（默认 1h；6h/24h/7d）、stepMsFor（默认 1m；
 * 5m/1h）、pointsFor 上限 500；非法值一律回退默认。</p>
 *
 * <p><b>quantile_fallback 语义注记（契约 S2/S8 双注记之 timeseries 侧）</b>：
 * 本端点 {@code quantile_fallback=true} = p50/p95/p99 <b>按 avg 退化填充</b>
 * （与 S2 traffic-summary 的「p95 缺失=null」语义不同，前端文案须区分）。</p>
 *
 * <p><b>降级铁律</b>：Prometheus 拒连/超时/非 200/坏 JSON → 不抛不 500，warn 后
 * source=snapshot（点数仍按 pointsFor 网格补齐，上限 500）。</p>
 */
@ExtendWith(MockitoExtension.class)
class MonitorGatewayTimeseriesServiceTest {

    private static final String METRICS_KEY = MetricsSnapshotReader.METRICS_SNAPSHOT_KEY;

    @Mock private RouteService routeService;
    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private SimpleMeterRegistry meterRegistry;
    private HttpServer prometheus;
    private final List<String> allQueries = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final Map<String, String> cannedResponses = new LinkedHashMap<>();
    private MetricsSnapshotReader snapshotReader;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        snapshotReader = new MetricsSnapshotReader(multiRedisManager, new ObjectMapper());
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);
        // 网关级快照兜底无论走「全量 HASH 求和（entries/values）」还是「按 path 逐查（get）」
        // 都拿到空数据 —— 本文件快照路径断言只钉形状（source/点数/字段集），不钉数值
        lenient().when(hashOperations.entries(METRICS_KEY)).thenReturn(Map.of());
        lenient().when(hashOperations.values(any())).thenReturn(List.of());
        lenient().doReturn(null).when(hashOperations).get(any(), any());
        // 网关级聚合无 routeId 输入；若 snapshot 兜底侧实现枚举路由也拿到空列表
        lenient().when(routeService.listRoutes(null, null, null)).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        if (prometheus != null) {
            prometheus.stop(0);
        }
    }

    private MonitorTimeseriesService serviceWith(String prometheusUrl) {
        return new MonitorTimeseriesService(routeService, meterRegistry, snapshotReader,
                new ObjectMapper(), prometheusUrl);
    }

    // ==================== a) 网关级聚合 = 6 序列 query_range 无 path 过滤 ====================

    /** 6 条查询齐发且全部不带 path 过滤/分组/归一（网关级 vs 带 routeId 版本的区别点）。 */
    @Test
    void gatewayQueriesCarryNoPathFilterGroupingOrNormalization() throws IOException {
        canned("requests_total", matrix("[[1793000000,\"10\"]]"));
        canned("requests_errors", matrix("[[1793000000,\"2\"]]"));
        canned("latency_seconds_sum", matrix("[[1793000000,\"0.01\"]]"));
        canned("quantile=\"0.5\"", matrix("[[1793000000,\"0.012\"]]"));
        canned("quantile=\"0.95\"", matrix("[[1793000000,\"0.045\"]]"));
        canned("quantile=\"0.99\"", matrix("[[1793000000,\"0.089\"]]"));
        startMockPrometheus();

        Map<String, Object> result = serviceWith("http://localhost:" + prometheus.getAddress().getPort())
                .gatewayTimeseries("1h", "1m");

        assertEquals("prometheus", result.get("source"));
        // 现有 6 序列照旧：total / errors / avg(sum 与 count 的 rate 合并单 query) / q0.5 / q0.95 / q0.99
        assertEquals(6, allQueries.size(), "应发出 6 条 range query: " + allQueries);
        List<String> decoded = allQueries.stream()
                .map(q -> URLDecoder.decode(q, StandardCharsets.UTF_8)).toList();
        assertTrue(decoded.stream().anyMatch(q -> q.contains("gateway4j_requests_total")),
                "应查询 requests_total: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("gateway4j_requests_errors")),
                "应查询 requests_errors: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("gateway4j_request_latency_seconds_sum")),
                "avg 分子应查询 latency_seconds_sum: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("gateway4j_request_latency_seconds_count")),
                "avg 分母应查询 latency_seconds_count: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("quantile=\"0.5\"")), "应查询 p50: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("quantile=\"0.95\"")), "应查询 p95: " + decoded);
        assertTrue(decoded.stream().anyMatch(q -> q.contains("quantile=\"0.99\"")), "应查询 p99: " + decoded);
        // 区别点：网关级查询串不得出现任何 path 引用（过滤/分组/归一产物/路由 path 原文）
        for (String q : decoded) {
            assertFalse(q.contains("path"), "网关级查询不得含 path 过滤或 by (path) 分组"
                    + "（分组序列会在合并网格按时间戳互相覆盖，total 退化为单 path 值）: " + q);
            assertFalse(q.contains("{id}"), "网关级查询不得含路径归一产物 {id}: " + q);
            assertFalse(q.contains("/api/a"), "网关级查询不得含任何路由 path 原文: " + q);
        }
        // 网关级无 routeId 输入，Prometheus 成功路径不得触达路由服务
        verifyNoInteractions(routeService);
    }

    // ==================== b) time_range / granularity 映射（rangeMsFor / stepMsFor 照旧） ====================

    /** 显式 24h/1h → end-start=86400s、step=3600s；6h/5m → 21600s、step=300s。 */
    @Test
    void explicit24hAnd6hWithGranularityMapToRangeParams() throws IOException {
        canned("requests_total", matrix("[]"));
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());

        service.gatewayTimeseries("24h", "1h");
        assertEquals(24 * 3600L, spanSecFrom(0), "24h → end-start = 86400s");
        assertEquals("3600", stepSecFrom(0), "granularity=1h → step=3600s");

        int before = allQueries.size();
        service.gatewayTimeseries("6h", "5m");
        assertEquals(6 * 3600L, spanSecFrom(before), "6h → end-start = 21600s");
        assertEquals("300", stepSecFrom(before), "granularity=5m → step=300s");
    }

    /** 非法 time_range/granularity 回退默认 1h/1m：end-start=3600s、step=60s。 */
    @Test
    void invalidTimeRangeAndGranularityFallBackToDefaults() throws IOException {
        canned("requests_total", matrix("[]"));
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());

        service.gatewayTimeseries("3x", "37s");

        assertEquals(3600L, spanSecFrom(0), "非法 time_range → 回退默认 1h");
        assertEquals("60", stepSecFrom(0), "非法 granularity → 回退默认 1m");
    }

    // ==================== c) pointsFor 上限 500 截断（快照网格可见） ====================

    /** 7d/1m 未封顶为 10080 点 → 截断 500；1h/1m 未触上限 → 60 点（点数=pointsFor 照旧）。 */
    @Test
    void snapshotPointsCappedAt500() {
        MonitorTimeseriesService service = serviceWith("");

        Map<String, Object> week = service.gatewayTimeseries("7d", "1m");
        assertEquals("snapshot", week.get("source"));
        assertEquals(500, ((List<?>) week.get("data_points")).size(), "7d/1m 超上限 → 截断 500");

        Map<String, Object> hour = service.gatewayTimeseries("1h", "1m");
        assertEquals(60, ((List<?>) hour.get("data_points")).size(), "1h/1m 未触上限 → 60 点");
    }

    // ==================== d) Prometheus 异常 → 降级不抛（铁律随迁） ====================

    /** Prometheus 拒连 → 不抛不 500，warn 后 source=snapshot、点数网格照补（既有 /timeseries 口径随迁）。 */
    @Test
    void prometheusFailureDegradesToSnapshotWithoutThrowing() {
        // 端口 1 几乎必然拒连（MonitorTimeseriesServiceTest.unreachablePrometheusFallsBackToSnapshot 同款）
        MonitorTimeseriesService service = serviceWith("http://localhost:1");

        Map<String, Object> result = assertDoesNotThrow(() -> service.gatewayTimeseries("1h", "1m"));

        assertEquals("snapshot", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertTrue(points.size() > 0, "降级仍须按网格补齐点数");
    }

    // ==================== e) quantile_fallback=true = 分位按 avg 退化填充 ====================

    /** quantile 序列缺失 → 标注 quantile_fallback=true，p50/p95/p99 按 avg 退化填充（非 null 占位）。 */
    @Test
    void quantileFallbackFillsQuantilesWithAvg() throws IOException {
        canned("requests_total", matrix("[[1793000000,\"10\"]]"));
        canned("requests_errors", matrix("[[1793000000,\"0\"]]"));
        canned("latency_seconds_sum", matrix("[[1793000000,\"0.01\"]]"));
        // quantile 查询不命中 canned → mock 回空 result → 三分位缺失 → 退化 avg
        startMockPrometheus();

        Map<String, Object> result = serviceWith("http://localhost:" + prometheus.getAddress().getPort())
                .gatewayTimeseries("1h", "1m");

        assertEquals("prometheus", result.get("source"));
        assertEquals(Boolean.TRUE, result.get("quantile_fallback"), "分位缺失须标注 quantile_fallback=true");
        Map<?, ?> dp = (Map<?, ?>) ((List<?>) result.get("data_points")).get(0);
        assertEquals(10.0, (double) dp.get("avg_latency_ms"), 1e-6);
        assertEquals(10.0, (double) dp.get("p50_latency_ms"), 1e-6, "p50 缺序列 → 按 avg 退化填充");
        assertEquals(10.0, (double) dp.get("p95_latency_ms"), 1e-6);
        assertEquals(10.0, (double) dp.get("p99_latency_ms"), 1e-6);
    }

    // ==================== f) 正常双源 ====================

    /** prometheus 成功：source=prometheus、秒→毫秒换算照旧、分位齐全时不得标注 quantile_fallback。 */
    @Test
    void prometheusSourceWinsWithMappedValues() throws IOException {
        canned("requests_total", matrix("[[1793000000,\"10\"]]"));
        canned("requests_errors", matrix("[[1793000000,\"2\"]]"));
        canned("latency_seconds_sum", matrix("[[1793000000,\"0.01\"]]"));
        canned("quantile=\"0.5\"", matrix("[[1793000000,\"0.012\"]]"));
        canned("quantile=\"0.95\"", matrix("[[1793000000,\"0.045\"]]"));
        canned("quantile=\"0.99\"", matrix("[[1793000000,\"0.089\"]]"));
        startMockPrometheus();

        Map<String, Object> result = serviceWith("http://localhost:" + prometheus.getAddress().getPort())
                .gatewayTimeseries("1h", "1m");

        assertEquals("prometheus", result.get("source"));
        assertFalse(result.containsKey("quantile_fallback"), "分位齐全时不得标注 quantile_fallback");
        Map<?, ?> dp = (Map<?, ?>) ((List<?>) result.get("data_points")).get(0);
        assertEquals(10L, dp.get("total_requests"));
        assertEquals(2L, dp.get("error_count"));
        assertEquals(0.2, (double) dp.get("error_rate"), 1e-9);
        // avg = 0.01s → 10ms；分位 0.012/0.045/0.089s → 12/45/89ms
        assertEquals(10.0, (double) dp.get("avg_latency_ms"), 1e-6);
        assertEquals(12.0, (double) dp.get("p50_latency_ms"), 1e-6);
        assertEquals(45.0, (double) dp.get("p95_latency_ms"), 1e-6);
        assertEquals(89.0, (double) dp.get("p99_latency_ms"), 1e-6);
    }

    /** snapshot 源：未配置 prometheus-url → source=snapshot，8 字段契约与 /timeseries 一致。 */
    @Test
    void snapshotSourceCarriesContractShape() {
        Map<String, Object> result = serviceWith("").gatewayTimeseries("1h", "1m");

        assertEquals("snapshot", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertTrue(points.size() > 0);
        Map<?, ?> dp = (Map<?, ?>) points.get(0);
        assertEquals(Set.of("timestamp", "total_requests", "error_count", "error_rate",
                        "avg_latency_ms", "p50_latency_ms", "p95_latency_ms", "p99_latency_ms"),
                dp.keySet(), "data_points 8 字段契约须与 /timeseries 一致");
        assertInstanceOf(String.class, dp.get("timestamp"), "timestamp 须为 ISO-8601 字符串");
        assertDoesNotThrow(() -> Instant.parse((String) dp.get("timestamp")),
                "timestamp 须可被 Instant.parse 解析");
    }

    // ==================== mock Prometheus（MonitorTimeseriesServiceTest 同款） ====================

    private void canned(String queryFragment, String response) {
        cannedResponses.put(queryFragment, response);
    }

    /** 网关级序列无 path 标签：metric 为空对象（与带 routeId 版本 matrix 的差异点）。 */
    private static String matrix(String values) {
        return "{\"status\":\"success\",\"data\":{\"resultType\":\"matrix\",\"result\":"
                + "[{\"metric\":{},\"values\":" + values + "}]}}";
    }

    private void startMockPrometheus() throws IOException {
        allQueries.clear();
        prometheus = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        prometheus.createContext("/api/v1/query_range", exchange -> {
            String rawQuery = exchange.getRequestURI().getRawQuery();
            allQueries.add(rawQuery == null ? "" : rawQuery);
            String matched = cannedResponses.entrySet().stream()
                    .filter(e -> rawQuery != null && URLDecoder.decode(rawQuery, StandardCharsets.UTF_8)
                            .contains(e.getKey()))
                    .map(Map.Entry::getValue)
                    .findFirst()
                    .orElse("{\"status\":\"success\",\"data\":{\"resultType\":\"matrix\",\"result\":[]}}");
            byte[] body = matched.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        prometheus.start();
    }

    /** 从 fromIndex 起（支持单测内多次调用被测方法）取含指定 metric 片段的首条 query 的 start/end 差（秒）。 */
    private long spanSecFrom(int fromIndex) {
        Map<String, String> params = queryParams(queryRawFrom(fromIndex, "gateway4j_requests_total"));
        return Long.parseLong(params.get("end")) - Long.parseLong(params.get("start"));
    }

    /** 从 fromIndex 起取含 gateway4j_requests_total 的首条 query 的 step 参数原文（秒）。 */
    private String stepSecFrom(int fromIndex) {
        return queryParams(queryRawFrom(fromIndex, "gateway4j_requests_total")).get("step");
    }

    private String queryRawFrom(int fromIndex, String metricFragment) {
        return allQueries.stream().skip(fromIndex)
                .filter(q -> URLDecoder.decode(q, StandardCharsets.UTF_8).contains(metricFragment))
                .findFirst().orElseThrow();
    }

    private static Map<String, String> queryParams(String rawQuery) {
        Map<String, String> params = new LinkedHashMap<>();
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                params.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return params;
    }
}
