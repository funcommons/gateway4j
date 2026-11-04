package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.common.model.Route;
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
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * S2 路由流量聚合（对应契约 §4 S2）：RouteTrafficSummaryService.summary() 纯 JUnit5 单测。
 *
 * <p><b>测试先行</b>：被测类尚未实现时本文件会使 admin 测试编译失败——这是预期流程，
 * C-agent 按本文件实现 {@code RouteTrafficSummaryService} 后由 R-agent 跑。</p>
 *
 * <p><b>期望构造签名</b>（@Value 用法与 MonitorTimeseriesService 同款）：
 * <pre>
 * public RouteTrafficSummaryService(RouteService routeService,
 *                                   MonitorTimeseriesService timeseriesService,
 *                                   UpstreamHealthProbe upstreamHealthProbe,
 *                                   MetricsSnapshotReader snapshotReader,
 *                                   ObjectMapper objectMapper,
 *                                   &#64;Value("${gateway4j.monitor.prometheus-url:}") String prometheusUrl)
 * </pre>
 * Prometheus 可用性判定允许两种实现（测试两端兼容）：读自身 prometheusUrl，或
 * 复用 {@code timeseriesService.isPrometheusConfigured()}（故该 stub 全部 lenient）。</p>
 *
 * <p><b>Prometheus 瞬时查询契约</b>（GET {url}/api/v1/query?query=...，mock 按 URL-decode
 * 后的 query 片段分发，实现发出的 PromQL 必须包含下列片段）：
 * hits_24h → {@code gateway4j_requests_total[24h]}（不含 status）；
 * status_codes → 同时含 {@code latency_seconds_count[24h]} 与 {@code status}（sum by (path, status)）；
 * qps → {@code gateway4j_requests_total[5m]}（rate）；
 * avg_latency_ms → {@code latency_seconds_sum}（rate(sum)/rate(count)，秒）；
 * p95_latency_ms → {@code quantile="0.95"}（latency gauge，秒）。序列 metric.path 为
 * 归一化 path（与 MonitorTimeseriesService.normalizePath 同约定：数字段 → {id}）；
 * latency 类秒值 ×1000 转毫秒。分发只匹配活代码片段——PromQL 常量不含行内注释，
 * mock 不依赖任何被注释掉的字符串。</p>
 *
 * <p><b>归桶铁律（写死）</b>：status 标签 2xx → c2xx；4xx/5xx → 各桶；其余（3xx、
 * 非数字等未知值）一律归 c4xx（errors 语义只含 4xx/5xx，未知按错误保守记 4xx）。
 * snapshot 模式 errors 是 4xx+5xx 合计、无法拆分 → 全记 c4xx、c5xx=0，c2xx=total-errors。</p>
 *
 * <p><b>snapshot 行</b>：p95_latency_ms 恒 null（快照无分位）、quantile_fallback 恒
 * false（该标志仅 Prometheus 模式标注 quantile 序列缺失）、qps 恒 0（快照无速率分量）。</p>
 */
@ExtendWith(MockitoExtension.class)
class RouteTrafficSummaryServiceTest {

    private static final String EMPTY_VECTOR =
            "{\"status\":\"success\",\"data\":{\"resultType\":\"vector\",\"result\":[]}}";

    @Mock private RouteService routeService;
    @Mock private MonitorTimeseriesService timeseriesService;
    @Mock private UpstreamHealthProbe upstreamHealthProbe;
    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private MetricsSnapshotReader snapshotReader;
    private HttpServer prometheus;
    private final List<String> allQueries = new CopyOnWriteArrayList<>();
    private String hitsResponse;
    private String qpsResponse;
    private String avgResponse;
    private String p95Response;
    private String statusResponse;
    /** 用例8 注入：非 null 且 query 命中该片段 → mock 返回 HTTP 500 空 body（其余片段照常分发）。 */
    private String failFragment;

    @BeforeEach
    void setUp() {
        snapshotReader = new MetricsSnapshotReader(multiRedisManager, new ObjectMapper());
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);
        lenient().when(upstreamHealthProbe.readAll()).thenReturn(Map.of());
        // Prometheus 可用性判定实现方式二选一（见类注释），stub 一律 lenient 保持两端兼容
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(false);
    }

    @AfterEach
    void tearDown() {
        if (prometheus != null) {
            prometheus.stop(0);
        }
    }

    /** 用例1：Prometheus 可用——多路由按 sum by (path) 各序列聚合；quantile 存在 → 数值 + fallback=false。 */
    @Test
    void prometheusAvailableAggregatesPerRoute() throws IOException {
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(true);
        mockRoutes(
                Route.builder().id(1L).routeName("alpha").path("/api/a")
                        .routeType("BACKEND").status("PUBLISHED").build(),
                Route.builder().id(2L).routeName("beta").path("/api/b/42")
                        .routeType("BACKEND").status("PUBLISHED").build(),
                Route.builder().id(3L).routeName("gateway").path("/api/gw")
                        .routeType("DISPATCH").status("PUBLISHED").build());
        hitsResponse = vector(vectorSeries("/api/a", "120"), vectorSeries("/api/b/{id}", "7"));
        qpsResponse = vector(vectorSeries("/api/a", "2.5"), vectorSeries("/api/b/{id}", "0.5"));
        avgResponse = vector(vectorSeries("/api/a", "0.01"), vectorSeries("/api/b/{id}", "0.1"));
        p95Response = vector(vectorSeries("/api/a", "0.045"),
                vectorSeries("/api/b/{id}", "0.2"), vectorSeries("/api/gw", "0.3"));
        statusResponse = vector(statusSeries("/api/a", "200", "100"),
                statusSeries("/api/a", "502", "20"), statusSeries("/api/b/{id}", "200", "7"));
        startMockPrometheus();

        List<Map<String, Object>> rows =
                service("http://localhost:" + prometheus.getAddress().getPort()).summary();

        assertFalse(allQueries.isEmpty(), "应发出 Prometheus 瞬时查询（GET /api/v1/query）");
        assertEquals(3, rows.size(), "每条路由一项（DISPATCH 路由也在内）");
        Map<String, Object> a = rowByPath(rows, "/api/a");
        assertEquals("1", a.get("route_id"), "Long id 输出 String");
        assertEquals("alpha", a.get("route_name"));
        assertEquals("/api/a", a.get("path"));
        assertEquals("PUBLISHED", a.get("status"), "status 透传 Route.status 原文");
        assertEquals(120L, a.get("hits_24h"));
        assertEquals(2.5, (double) a.get("qps"), 1e-9);
        assertEquals(45.0, (double) a.get("p95_latency_ms"), 1e-6, "quantile 秒 → 毫秒");
        assertEquals(10.0, (double) a.get("avg_latency_ms"), 1e-6, "rate(sum)/rate(count) 秒 → 毫秒");
        Map<?, ?> codes = (Map<?, ?>) a.get("status_codes");
        assertEquals(100L, codes.get("c2xx"));
        assertEquals(0L, codes.get("c4xx"));
        assertEquals(20L, codes.get("c5xx"));
        assertNull(a.get("upstream"), "probe 未覆盖 → upstream=null");
        assertEquals("prometheus", a.get("source"));
        assertEquals(Boolean.FALSE, a.get("quantile_fallback"));
        Map<String, Object> b = rowByPath(rows, "/api/b/{id}");
        assertEquals("2", b.get("route_id"));
        assertEquals("/api/b/{id}", b.get("path"), "path 归一化：数字段 → {id}");
        assertEquals(7L, b.get("hits_24h"));
        assertEquals(200.0, (double) b.get("p95_latency_ms"), 1e-6);
    }

    /** 用例2：quantile 序列缺失 → p95=null + quantile_fallback=true，不抛异常，其余字段不受影响。 */
    @Test
    void missingQuantileSeriesYieldsNullP95AndFallbackFlag() throws IOException {
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(true);
        mockRoutes(Route.builder().id(1L).routeName("alpha").path("/api/a").status("PUBLISHED").build());
        hitsResponse = vector(vectorSeries("/api/a", "9"));
        qpsResponse = vector(vectorSeries("/api/a", "1.5"));
        avgResponse = vector(vectorSeries("/api/a", "0.02"));
        startMockPrometheus();

        List<Map<String, Object>> rows = assertDoesNotThrow(
                () -> service("http://localhost:" + prometheus.getAddress().getPort()).summary());

        Map<String, Object> a = rowByPath(rows, "/api/a");
        assertEquals("prometheus", a.get("source"));
        assertNull(a.get("p95_latency_ms"), "quantile 序列缺失 → p95=null");
        assertEquals(Boolean.TRUE, a.get("quantile_fallback"));
        assertEquals(9L, a.get("hits_24h"));
        assertEquals(20.0, (double) a.get("avg_latency_ms"), 1e-6, "avg 不受 quantile 缺失影响");
    }

    /** 用例3：Prometheus 拒连 → 静默回退 snapshot（断言返回值而非日志），snapshot 有数则映射。 */
    @Test
    void prometheusDownFallsBackToSnapshotSilently() {
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(true);
        mockRoutes(Route.builder().id(1L).routeName("alpha").path("/api/a").status("PUBLISHED").build());
        snapshotFor("/api/a", "{\"total\":50,\"errors\":5,\"latency_ms_sum\":1000.0,"
                + "\"latency_count\":20,\"active\":1}");

        List<Map<String, Object>> rows = assertDoesNotThrow(() -> service("http://localhost:1").summary());

        Map<String, Object> a = rowByPath(rows, "/api/a");
        assertEquals("snapshot", a.get("source"));
        assertEquals(50L, a.get("hits_24h"));
        assertEquals(0.0, (double) a.get("qps"), 1e-9);
        assertNull(a.get("p95_latency_ms"));
        assertEquals(50.0, (double) a.get("avg_latency_ms"), 1e-6, "latency_ms_sum/latency_count");
        Map<?, ?> codes = (Map<?, ?>) a.get("status_codes");
        assertEquals(45L, codes.get("c2xx"), "c2xx = total - errors");
        assertEquals(5L, codes.get("c4xx"), "快照 errors 是 4xx/5xx 合计无法拆分 → 全记 c4xx");
        assertEquals(0L, codes.get("c5xx"));
        assertEquals(Boolean.FALSE, a.get("quantile_fallback"), "fallback 标志仅 Prometheus 模式使用");
    }

    /** 用例4：snapshot 也空（Redis 无该 field → ZERO）→ 基础行数值全 0，不抛异常。 */
    @Test
    void emptySnapshotYieldsBasicRowWithoutThrowing() {
        mockRoutes(Route.builder().id(1L).routeName("alpha").path("/api/a").status("DRAFT").build());

        List<Map<String, Object>> rows = assertDoesNotThrow(() -> service("").summary());

        assertEquals(1, rows.size());
        Map<String, Object> a = rows.get(0);
        assertEquals("snapshot", a.get("source"));
        assertEquals("DRAFT", a.get("status"));
        assertEquals(0L, a.get("hits_24h"));
        assertEquals(0.0, (double) a.get("qps"), 1e-9);
        assertEquals(0.0, (double) a.get("avg_latency_ms"), 1e-9);
        assertNull(a.get("p95_latency_ms"));
        Map<?, ?> codes = (Map<?, ?>) a.get("status_codes");
        assertEquals(0L, codes.get("c2xx"));
        assertEquals(0L, codes.get("c4xx"));
        assertEquals(0L, codes.get("c5xx"));
        assertNull(a.get("upstream"));
        assertEquals(Boolean.FALSE, a.get("quantile_fallback"));
    }

    /** 用例5：状态码归桶——200→c2xx、502→c5xx；未知值（302/abc）按铁律归 c4xx（写死，见类注释）。分发只匹配活代码片段。 */
    @Test
    void statusCodeBucketingPinsUnknownTo4xx() throws IOException {
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(true);
        mockRoutes(Route.builder().id(1L).routeName("alpha").path("/api/a").status("PUBLISHED").build());
        hitsResponse = vector(vectorSeries("/api/a", "17"));
        statusResponse = vector(statusSeries("/api/a", "200", "10"),
                statusSeries("/api/a", "404", "3"), statusSeries("/api/a", "502", "2"),
                statusSeries("/api/a", "302", "1"), statusSeries("/api/a", "abc", "1"));
        startMockPrometheus();

        Map<String, Object> a = rowByPath(
                service("http://localhost:" + prometheus.getAddress().getPort()).summary(), "/api/a");

        Map<?, ?> codes = (Map<?, ?>) a.get("status_codes");
        assertEquals(10L, codes.get("c2xx"));
        assertEquals(5L, codes.get("c4xx"), "404=3 + 未知归桶（302/abc 各 1）");
        assertEquals(2L, codes.get("c5xx"));
        assertEquals(17L, a.get("hits_24h"), "hits 与 status 归桶互不干扰（两条不同 query）");
    }

    /** 用例6：probe 命中的路由映射 upstream（reachable/latency_ms/checked_at 透传）；未命中 → null。 */
    @Test
    void upstreamProbeRowsMapToRouteOrNull() {
        mockRoutes(
                Route.builder().id(1L).routeName("alpha").path("/api/a").status("PUBLISHED").build(),
                Route.builder().id(2L).routeName("beta").path("/api/b").status("PUBLISHED").build());
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("reachable", Boolean.TRUE);
        health.put("latency_ms", 42L);
        health.put("checked_at", 1793000000123L);
        when(upstreamHealthProbe.readAll()).thenReturn(Map.of("1", health));

        List<Map<String, Object>> rows = service("").summary();

        Map<?, ?> up = (Map<?, ?>) rowByPath(rows, "/api/a").get("upstream");
        assertEquals(Boolean.TRUE, up.get("reachable"));
        assertEquals(42L, up.get("latency_ms"));
        assertEquals(1793000000123L, up.get("checked_at"), "checked_at 原样透传");
        assertNull(rowByPath(rows, "/api/b").get("upstream"), "probe 空（未覆盖该路由）→ upstream=null");
    }

    /** 用例7：超大 Long 路由 id 输出精确字符串（防 JS 精度丢失）；checked_at 大数值原样透传。 */
    @Test
    void largeRouteIdRenderedAsStringAndTimestampsPassThrough() {
        long bigId = 1934567890123456789L;
        mockRoutes(Route.builder().id(bigId).routeName("big").path("/api/big").status("PUBLISHED").build());
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("reachable", Boolean.FALSE);
        health.put("latency_ms", 0L);
        health.put("checked_at", 1700000000000L);
        when(upstreamHealthProbe.readAll()).thenReturn(Map.of(String.valueOf(bigId), health));

        Map<String, Object> row = service("").summary().get(0);

        assertEquals(String.valueOf(bigId), row.get("route_id"), "Long id → String");
        Map<?, ?> up = (Map<?, ?>) row.get("upstream");
        assertEquals(Boolean.FALSE, up.get("reachable"));
        assertEquals(1700000000000L, up.get("checked_at"), "时间戳字段透传保持原样");
    }

    /**
     * 用例8：单条查询失败（hits 片段 requests_total[24h] 返回 HTTP 500）→ 仅该序列按
     * 空数据降级（hits_24h=0），其余 4 条照常、source 仍为 prometheus、不抛异常——
     * 锁住「部分失败不整表回退快照」语义（用例3 只覆盖全败回退）。qps/avg/p95/
     * status_codes 取值与用例 1 的 /api/a 行一致，便于对照。
     */
    @Test
    void prometheusPartialFailureDegradesOnlyFailedSeries() throws IOException {
        lenient().when(timeseriesService.isPrometheusConfigured()).thenReturn(true);
        mockRoutes(Route.builder().id(1L).routeName("alpha").path("/api/a").status("PUBLISHED").build());
        hitsResponse = vector(vectorSeries("/api/a", "120"));
        qpsResponse = vector(vectorSeries("/api/a", "2.5"));
        avgResponse = vector(vectorSeries("/api/a", "0.01"));
        p95Response = vector(vectorSeries("/api/a", "0.045"));
        statusResponse = vector(statusSeries("/api/a", "200", "100"), statusSeries("/api/a", "502", "20"));
        failFragment = "requests_total[24h]";
        startMockPrometheus();

        List<Map<String, Object>> rows = assertDoesNotThrow(
                () -> service("http://localhost:" + prometheus.getAddress().getPort()).summary());

        assertEquals(1, rows.size(), "部分失败不触发整表回退，行集仍由 Prometheus 数据构成");
        Map<String, Object> a = rowByPath(rows, "/api/a");
        assertEquals("prometheus", a.get("source"), "单条失败降级后 source 仍为 prometheus");
        assertEquals(0L, a.get("hits_24h"), "失败序列按空数据降级 → hits_24h=0");
        assertEquals(2.5, (double) a.get("qps"), 1e-9, "qps 序列照常（与用例1同值）");
        assertEquals(10.0, (double) a.get("avg_latency_ms"), 1e-6, "avg 秒 → 毫秒（与用例1同值）");
        assertEquals(45.0, (double) a.get("p95_latency_ms"), 1e-6, "p95 秒 → 毫秒（与用例1同值）");
        assertEquals(Boolean.FALSE, a.get("quantile_fallback"), "p95 数据正常 → fallback=false");
        Map<?, ?> codes = (Map<?, ?>) a.get("status_codes");
        assertEquals(100L, codes.get("c2xx"), "status_codes 序列照常（与用例1同值）");
        assertEquals(0L, codes.get("c4xx"));
        assertEquals(20L, codes.get("c5xx"));
        assertEquals(20L, a.get("errors"), "errors = c4xx + c5xx");
    }

    // ==================== fixtures ====================

    /** 路由列表桩：按侦察固定走 listRoutes(null, null, null) 三参重载（MonitorController 同款）。 */
    private void mockRoutes(Route... routes) {
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(routes));
    }

    private void snapshotFor(String path, String json) {
        when(hashOperations.get(MetricsSnapshotReader.METRICS_SNAPSHOT_KEY, path)).thenReturn(json);
    }

    private RouteTrafficSummaryService service(String prometheusUrl) {
        return new RouteTrafficSummaryService(routeService, timeseriesService, upstreamHealthProbe,
                snapshotReader, new ObjectMapper(), prometheusUrl);
    }

    private static Map<String, Object> rowByPath(List<Map<String, Object>> rows, String path) {
        return rows.stream().filter(r -> path.equals(r.get("path"))).findFirst().orElseThrow();
    }

    private static String vectorSeries(String path, String value) {
        return "{\"metric\":{\"path\":\"" + path + "\"},\"value\":[1793000000,\"" + value + "\"]}";
    }

    private static String statusSeries(String path, String status, String value) {
        return "{\"metric\":{\"path\":\"" + path + "\",\"status\":\"" + status
                + "\"},\"value\":[1793000000,\"" + value + "\"]}";
    }

    private static String vector(String... series) {
        return "{\"status\":\"success\",\"data\":{\"resultType\":\"vector\",\"result\":["
                + String.join(",", series) + "]}}";
    }

    /** mock Prometheus：按 URL-decode 后的 query 片段分发（优先级序，见类注释片段契约；只匹配活代码片段）。 */
    private String respondTo(String decoded) {
        if (decoded.contains("latency_seconds_count[24h]") && decoded.contains("status")) return statusResponse;
        if (decoded.contains("requests_total[24h]")) return hitsResponse;
        if (decoded.contains("requests_total[5m]")) return qpsResponse;
        if (decoded.contains("latency_seconds_sum")) return avgResponse;
        if (decoded.contains("quantile=\"0.95\"")) return p95Response;
        return EMPTY_VECTOR;
    }

    private void startMockPrometheus() throws IOException {
        allQueries.clear();
        prometheus = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        prometheus.createContext("/api/v1/query", exchange -> {
            String raw = exchange.getRequestURI().getRawQuery();
            allQueries.add(raw == null ? "" : raw);
            String decoded = java.net.URLDecoder.decode(raw == null ? "" : raw, StandardCharsets.UTF_8);
            // 用例8 注入的单条故障：命中 failFragment → HTTP 500 空 body（在 respondTo 之前拦截）
            if (failFragment != null && decoded.contains(failFragment)) {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
                return;
            }
            byte[] body = respondTo(decoded).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        prometheus.start();
    }
}
