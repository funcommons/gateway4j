package fun.commons.gateway4j.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.MetricsSnapshotReader;
import fun.commons.gateway4j.admin.service.MonitorTimeseriesService;
import fun.commons.gateway4j.admin.service.RouteSimulateService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.UpstreamHealthProbe;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MonitorControllerTest {

    private static final String METRICS_KEY = MetricsSnapshotReader.METRICS_SNAPSHOT_KEY;

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;
    @Mock private org.springframework.beans.factory.ObjectProvider<MultiRedisManager> redisManagerProvider;
    @Mock private RouteSimulateService routeSimulateService;

    private SimpleMeterRegistry meterRegistry;
    private MonitorController controller;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        MetricsSnapshotReader snapshotReader = new MetricsSnapshotReader(multiRedisManager, new ObjectMapper());
        // prometheus-url 留空 = 未配置 → 时序端点恒走 snapshot 回退路径
        MonitorTimeseriesService timeseriesService = new MonitorTimeseriesService(
                routeService, meterRegistry, snapshotReader, new ObjectMapper(), "");
        UpstreamHealthProbe healthProbe = new UpstreamHealthProbe(routeService, redisManagerProvider);
        controller = new MonitorController(routeService, conditionMapper, timeseriesService,
                routeSimulateService, healthProbe);
        lenient().when(redisManagerProvider.getIfAvailable()).thenReturn(multiRedisManager);
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);
    }

    @Test
    void listRouteStatusAll() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        List<Map<String, Object>> result = controller.listRouteStatus(null);
        assertEquals(1, result.size());
        assertEquals("1", result.get(0).get("route_id"));
        assertEquals("HEALTHY", result.get(0).get("status"));
    }

    @Test
    void listRouteStatusById() {
        Route route = Route.builder().id(1L).routeName("r1").build();
        when(routeService.getById(1L)).thenReturn(route);
        List<Map<String, Object>> result = controller.listRouteStatus("1");
        assertEquals(1, result.size());
    }

    @Test
    void routeMetrics() {
        Route route = Route.builder().id(1L).path("/api/a").build();
        when(routeService.getById(1L)).thenReturn(route);
        Map<String, Object> result = controller.routeMetrics(1L, "1h", "1m");
        assertEquals("1", result.get("route_id"));
        assertTrue(((List<?>) result.get("data_points")).size() > 0);
        assertTrue(result.containsKey("granularity"));
    }

    @Test
    void getTopology() {
        Route r1 = Route.builder().id(1L).routeName("dispatch").routeType("DISPATCH").build();
        Route r2 = Route.builder().id(2L).routeName("backend").routeType("BACKEND").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(r1, r2));
        when(conditionMapper.selectList(null)).thenReturn(List.of(
                RouteCondition.builder().routeId(1L).targetRouteId(2L)
                        .conditionType("HEADER").operator("EQ").conditionKey("X-V").build()));

        Map<String, Object> result = controller.getTopology();
        List<?> nodes = (List<?>) result.get("nodes");
        List<?> edges = (List<?>) result.get("edges");
        assertEquals(2, nodes.size());
        assertEquals(1, edges.size());
        Map<?, ?> edge = (Map<?, ?>) edges.get(0);
        assertEquals("1", edge.get("source_id"));
        assertEquals("2", edge.get("target_id"));
    }

    /** 快照存在（数据面 9300 写入）→ buildStatus 的 total_requests > 0，即使本地注册表为空。 */
    @Test
    void redisSnapshotFeedsRouteStatusWhenLocalRegistryEmpty() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        when(hashOperations.get(METRICS_KEY, "/api/a")).thenReturn(
                "{\"total\":3,\"errors\":1,\"latency_ms_sum\":150.0,\"latency_count\":2,\"updated_at\":1}");

        List<Map<String, Object>> result = controller.listRouteStatus(null);

        assertEquals(3L, result.get(0).get("total_requests"));
        assertEquals(1L, result.get(0).get("error_count"));
        assertEquals(1.0 / 3.0, (double) result.get(0).get("error_rate"), 1e-9);
    }

    /** 本地注册表数值仍生效（单测/数据面内场景）：快照缺失时用本地 Counter 求和。 */
    @Test
    void localMeterRegistryValuesStillTakeEffect() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        Counter.builder("gateway4j.requests.total").tag("method", "GET").tag("path", "/api/a")
                .register(meterRegistry).increment(3);

        List<Map<String, Object>> result = controller.listRouteStatus(null);

        assertEquals(3L, result.get(0).get("total_requests"));
        assertEquals(0L, result.get(0).get("error_count"));
        assertEquals("HEALTHY", result.get(0).get("status"));
    }

    /** Redis 拒连 → 快照分量按 0 降级，接口不抛异常；本地注册表路径继续生效。 */
    @Test
    void redisFailureFallsBackToZeroWithoutThrowing() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        when(hashOperations.get(METRICS_KEY, "/api/a"))
                .thenThrow(new RedisConnectionFailureException("conn refused"));

        List<Map<String, Object>> result = assertDoesNotThrow(() -> controller.listRouteStatus(null));

        assertEquals(0L, result.get(0).get("total_requests"));
        assertEquals(0L, result.get(0).get("error_count"));
    }

    /** P0-2：data_points.timestamp 必须是 ISO-8601 字符串（裸 epoch 毫秒会被 Long→String 契约变成 "1793..."，前端 new Date() 得 Invalid Date）。 */
    @Test
    void routeMetricsTimestampsAreIso8601Strings() {
        Route route = Route.builder().id(1L).path("/api/a").build();
        when(routeService.getById(1L)).thenReturn(route);

        Map<String, Object> result = controller.routeMetrics(1L, "1h", "1m");

        List<?> points = (List<?>) result.get("data_points");
        assertTrue(points.size() > 0);
        for (Object p : points) {
            Map<?, ?> dp = (Map<?, ?>) p;
            Object ts = dp.get("timestamp");
            assertInstanceOf(String.class, ts, "timestamp 必须是 ISO-8601 字符串");
            assertDoesNotThrow(() -> Instant.parse((String) ts), "timestamp 必须可被 Instant.parse 解析");
        }
    }

    /** avg_latency：本地无数据时用 Redis 快照的 分子/分母（latency_ms_sum / latency_count）。 */
    @Test
    void routeMetricsAvgLatencyUsesSnapshotWhenLocalEmpty() {
        Route route = Route.builder().id(1L).path("/api/a").build();
        when(routeService.getById(1L)).thenReturn(route);
        when(hashOperations.get(METRICS_KEY, "/api/a")).thenReturn(
                "{\"total\":2,\"errors\":0,\"latency_ms_sum\":300.0,\"latency_count\":2,\"updated_at\":1}");

        Map<String, Object> result = controller.routeMetrics(1L, "1h", "1m");

        List<?> points = (List<?>) result.get("data_points");
        for (Object p : points) {
            Map<?, ?> dp = (Map<?, ?>) p;
            assertEquals(150.0, (double) dp.get("avg_latency_ms"), 1e-9);
            assertEquals(0.0, (double) dp.get("p50_latency_ms"), 1e-9);
        }
    }

    // ==================== P1-1：active_connections 不再硬编码 0 ====================

    /** 快照含 active 字段（H1 新契约）→ buildStatus 读真实在途数。 */
    @Test
    void activeConnectionsReadFromSnapshotActiveField() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        when(hashOperations.get(METRICS_KEY, "/api/a")).thenReturn(
                "{\"total\":3,\"errors\":0,\"latency_ms_sum\":0,\"latency_count\":0,\"active\":7,\"updated_at\":1}");

        List<Map<String, Object>> result = controller.listRouteStatus(null);

        assertEquals(7L, result.get(0).get("active_connections"));
    }

    /** 旧版快照缺 active 字段 → 回退 0（向后兼容 H1 上线前的现值格式）。 */
    @Test
    void activeConnectionsFallBackToZeroWhenSnapshotLacksField() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        when(hashOperations.get(METRICS_KEY, "/api/a")).thenReturn(
                "{\"total\":3,\"errors\":0,\"latency_ms_sum\":0,\"latency_count\":0,\"updated_at\":1}");

        List<Map<String, Object>> result = controller.listRouteStatus(null);

        assertEquals(0L, result.get(0).get("active_connections"));
    }

    // ==================== P1-6：timeseries 端点（未配 Prometheus → snapshot 回退） ====================

    /** 未配置 prometheus-url → source=snapshot，形状与契约一致（8 字段 data_points）。 */
    @Test
    void timeseriesFallsBackToSnapshotWhenPrometheusNotConfigured() {
        Route route = Route.builder().id(1L).path("/api/a").build();
        when(routeService.getById(1L)).thenReturn(route);

        Map<String, Object> result = controller.timeseries(1L, "1h", "1m");

        assertEquals("snapshot", result.get("source"));
        List<?> points = (List<?>) result.get("data_points");
        assertTrue(points.size() > 0);
        Map<?, ?> dp = (Map<?, ?>) points.get(0);
        assertEquals(Set.of("timestamp", "total_requests", "error_count", "error_rate",
                        "avg_latency_ms", "p50_latency_ms", "p95_latency_ms", "p99_latency_ms"),
                dp.keySet(), "data_points 字段集须与契约一致");
    }

    // ==================== P2-6：upstream 健康态扩展 + 路由模拟 ====================

    /** P2-6：HASH 有健康值 → 行内 upstream 字段透出；无 → null。 */
    @Test
    void listRouteStatusIncludesUpstreamHealth() {
        Route probed = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        Route unprobed = Route.builder().id(2L).routeName("r2").routeType("BACKEND").path("/api/b").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(probed, unprobed));
        when(hashOperations.entries(UpstreamHealthProbe.HEALTH_KEY)).thenReturn(Map.of(
                "1", "{\"reachable\":true,\"latency_ms\":12,\"checked_at\":1}"));

        List<Map<String, Object>> result = controller.listRouteStatus(null);

        assertEquals(true, ((Map<?, ?>) result.get(0).get("upstream")).get("reachable"));
        assertNull(result.get(1).get("upstream"));
    }

    /** P2-6：上游探测读失败（Redis 拒连）→ upstream=null，不影响状态行输出。 */
    @Test
    void listRouteStatusUpstreamNullWhenHealthReadFails() {
        Route route = Route.builder().id(1L).routeName("r1").routeType("BACKEND").path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(route));
        when(hashOperations.entries(UpstreamHealthProbe.HEALTH_KEY))
                .thenThrow(new RedisConnectionFailureException("conn refused"));
        when(hashOperations.get(METRICS_KEY, "/api/a"))
                .thenThrow(new RedisConnectionFailureException("conn refused"));

        List<Map<String, Object>> result = assertDoesNotThrow(() -> controller.listRouteStatus(null));

        assertEquals(1, result.size());
        assertNull(result.get(0).get("upstream"));
    }

    /** P2-6：POST /v1/monitor/route-simulate 委托 RouteSimulateService。 */
    @Test
    void routeSimulateDelegatesToService() {
        Map<String, Object> simulated = Map.of("matched", true, "route", Map.of("route_name", "r1"));
        when(routeSimulateService.simulate("/api/a", "GET",
                Map.of("X-V", "v2"), Map.of())).thenReturn(simulated);

        Map<String, Object> result = controller.routeSimulate(
                new MonitorController.RouteSimulateRequest("/api/a", "GET",
                        Map.of("X-V", "v2"), Map.of()));

        assertEquals(true, result.get("matched"));
    }
}
