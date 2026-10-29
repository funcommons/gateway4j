package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import fun.commons.gateway4j.common.model.Route;
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
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * P1-6 指标时序：Prometheus 优先（mock HTTP API）、查询失败/未配置 → snapshot 回退。
 */
@ExtendWith(MockitoExtension.class)
class MonitorTimeseriesServiceTest {

    private static final String METRICS_KEY = MetricsSnapshotReader.METRICS_SNAPSHOT_KEY;
    private static final String PATH = "/api/a";

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

    /** 未配置 prometheus-url（默认空）→ source=snapshot，Prometheus 零调用。 */
    @Test
    void emptyUrlFallsBackToSnapshot() {
        MonitorTimeseriesService service = serviceWith("");
        mockRoute();

        Map<String, Object> result = service.timeseries(1L, "1h", "1m");

        assertEquals("snapshot", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertEquals(60, points.size(), "1h/1m → 60 个数据点");
    }

    /** Prometheus 可达且返回标准 range query 结果 → source=prometheus，各序列按 query 分发映射。 */
    @Test
    void reachablePrometheusWinsWithMappedValues() throws IOException {
        canned("requests_total", matrix("[[1793000000,\"10\"]]"));
        canned("requests_errors", matrix("[[1793000000,\"2\"]]"));
        // avg 是一条合并 query（PromQL 服务端做 rate 除法），mock 直接回 0.01s（=0.05/5）
        canned("latency_seconds_sum", matrix("[[1793000000,\"0.01\"]]"));
        canned("quantile=\"0.5\"", matrix("[[1793000000,\"0.012\"]]"));
        canned("quantile=\"0.95\"", matrix("[[1793000000,\"0.045\"]]"));
        canned("quantile=\"0.99\"", matrix("[[1793000000,\"0.089\"]]"));
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());

        Map<String, Object> result = service.timeseries(1L, "1h", "1m");

        assertEquals("prometheus", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertEquals(1, points.size());
        Map<?, ?> dp = (Map<?, ?>) points.get(0);
        assertEquals(10L, dp.get("total_requests"));
        assertEquals(2L, dp.get("error_count"));
        assertEquals(0.2, (double) dp.get("error_rate"), 1e-9);
        // avg = 0.01s → 10ms
        assertEquals(10.0, (double) dp.get("avg_latency_ms"), 1e-6);
        assertEquals(12.0, (double) dp.get("p50_latency_ms"), 1e-6);
        assertEquals(45.0, (double) dp.get("p95_latency_ms"), 1e-6);
        assertEquals(89.0, (double) dp.get("p99_latency_ms"), 1e-6);
    }

    /** Prometheus 可达但 quantile 序列缺失 → 该分位退化为 avg，不影响其余字段。 */
    @Test
    void missingQuantileSeriesDegradesToAvg() throws IOException {
        canned("requests_total", matrix("[[1793000000,\"10\"]]"));
        canned("requests_errors", matrix("[[1793000000,\"0\"]]"));
        canned("latency_seconds_sum", matrix("[[1793000000,\"0.01\"]]"));
        // quantile 响应缺失 → mock 返回空 result
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());
        mockRoute();

        Map<String, Object> result = service.timeseries(1L, "1h", "1m");

        assertEquals("prometheus", result.get("source"));
        // 任务口径：分位退化要在返回中标注
        assertEquals(Boolean.TRUE, result.get("quantile_fallback"), "quantile 缺失应标注 quantile_fallback");
        Map<?, ?> dp = (Map<?, ?>) ((List<?>) result.get("data_points")).get(0);
        assertEquals(10.0, (double) dp.get("avg_latency_ms"), 1e-6);
        assertEquals(10.0, (double) dp.get("p50_latency_ms"), 1e-6, "p50 缺序列 → 退化 avg");
        assertEquals(10.0, (double) dp.get("p95_latency_ms"), 1e-6);
        assertEquals(10.0, (double) dp.get("p99_latency_ms"), 1e-6);
    }

    /** Prometheus 配置但拒连（端口无监听）→ 回退 snapshot，绝不抛异常。 */
    @Test
    void unreachablePrometheusFallsBackToSnapshot() {
        // 端口 1（tcpmux）几乎必然拒连；即便个别环境有监听也会因非 Prom 格式走坏 JSON 回退
        MonitorTimeseriesService service = serviceWith("http://localhost:1");
        mockRoute();

        Map<String, Object> result = assertDoesNotThrow(() -> service.timeseries(1L, "1h", "1m"));

        assertEquals("snapshot", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertTrue(points.size() > 0);
    }

    /** Prometheus 返回 error 状态 → 同样回退 snapshot。 */
    @Test
    void prometheusErrorResponseFallsBackToSnapshot() throws IOException {
        canned("requests_total", "{\"status\":\"error\",\"error\":\"bad query\"}");
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());
        mockRoute();

        Map<String, Object> result = service.timeseries(1L, "1h", "1m");

        assertEquals("snapshot", result.get("source"));
    }

    /** 查询请求确实携带了 path 过滤与 range query 参数（PromQL 组装正确性）。 */
    @Test
    void queriesCarryPathFilterAndRangeParams() throws IOException {
        canned("requests_total", matrix("[]"));
        startMockPrometheus();
        MonitorTimeseriesService service = serviceWith("http://localhost:" + prometheus.getAddress().getPort());
        mockRoute();

        service.timeseries(1L, "1h", "1m");

        // 6 条 query 依序发出，捕获全部后再断言（lastQuery 只留最后一条会误判）
        assertTrue(allQueries.stream().anyMatch(q -> q.contains("gateway4j_requests_total")),
                "应查询 requests_total: " + allQueries);
        String totalQuery = allQueries.stream().filter(q -> q.contains("gateway4j_requests_total"))
                .findFirst().orElseThrow();
        String decoded = java.net.URLDecoder.decode(totalQuery, StandardCharsets.UTF_8);
        assertTrue(decoded.contains("path="), "应按 path tag 过滤: " + decoded);
        assertTrue(decoded.contains("/api/a"), "path 值应包含路由 path: " + decoded);
        assertTrue(totalQuery.contains("start=") && totalQuery.contains("end=") && totalQuery.contains("step="),
                "应为 range query 参数: " + totalQuery);
    }

    private void mockRoute() {
        Route route = Route.builder().id(1L).path(PATH).build();
        when(routeService.getById(1L)).thenReturn(route);
    }

    private void canned(String queryFragment, String response) {
        cannedResponses.put(queryFragment, response);
    }

    private static String matrix(String values) {
        return "{\"status\":\"success\",\"data\":{\"resultType\":\"matrix\",\"result\":"
                + "[{\"metric\":{\"path\":\"" + PATH + "\"},\"values\":" + values + "}]}}";
    }

    private void startMockPrometheus() throws IOException {
        allQueries.clear();
        prometheus = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        prometheus.createContext("/api/v1/query_range", exchange -> {
            String rawQuery = exchange.getRequestURI().getRawQuery();
            allQueries.add(rawQuery == null ? "" : rawQuery);
            String matched = cannedResponses.entrySet().stream()
                    .filter(e -> rawQuery != null && java.net.URLDecoder.decode(rawQuery, StandardCharsets.UTF_8)
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
}
