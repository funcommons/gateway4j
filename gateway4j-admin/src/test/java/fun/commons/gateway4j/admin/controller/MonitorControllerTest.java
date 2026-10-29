package fun.commons.gateway4j.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.MetricsSnapshotReader;
import fun.commons.gateway4j.admin.service.RouteService;
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

    private SimpleMeterRegistry meterRegistry;
    private MonitorController controller;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        MetricsSnapshotReader snapshotReader = new MetricsSnapshotReader(multiRedisManager, new ObjectMapper());
        controller = new MonitorController(meterRegistry, routeService, conditionMapper, snapshotReader);
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
}
