package fun.commons.gateway4j.admin.service;

import com.sun.net.httpserver.HttpServer;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.common.model.Route;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P2-6 上游主动探测单测：JDK 内置 HttpServer 起本地真端口验证 HEAD/GET 兜底
 * 与可达口径；Redis 侧全 mock，验证 HASH 写入契约（field=route_id + TTL）。
 */
@ExtendWith(MockitoExtension.class)
class UpstreamHealthProbeTest {

    @Mock private RouteService routeService;
    @Mock private ObjectProvider<MultiRedisManager> redisManagerProvider;
    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private UpstreamHealthProbe probe;
    private HttpServer server;
    private volatile int headStatus = 200;
    private volatile int getStatus = 200;
    /** HEAD 请求直接断连（不发响应）——模拟"服务不支持 HEAD/半死"，逼出 GET 兜底。 */
    private volatile boolean headAbort = false;

    @BeforeEach
    void setUp() throws Exception {
        probe = new UpstreamHealthProbe(routeService, redisManagerProvider);
        lenient().when(redisManagerProvider.getIfAvailable()).thenReturn(multiRedisManager);
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);

        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            if ("HEAD".equals(exchange.getRequestMethod())) {
                if (headAbort) {
                    exchange.close();
                    return;
                }
                exchange.sendResponseHeaders(headStatus, -1);
                exchange.close();
                return;
            }
            byte[] body = String.valueOf(getStatus).getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(getStatus, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/health";
    }

    private Route route(Long id, String upstreamUrl) {
        return Route.builder().id(id).routeName("r" + id).routeType("BACKEND")
                .path("/p" + id).upstreamUrl(upstreamUrl).build();
    }

    /** 取写入 HASH 的 value JSON（field=route_id）。 */
    private String capturedValue(String field) {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(hashOperations, atLeastOnce())
                .put(eq(UpstreamHealthProbe.HEALTH_KEY), eq(field), captor.capture());
        return captor.getValue();
    }

    @Test
    void headSuccessWritesReachableTrueWithLatencyAndTs() {
        probe.probeOne(stringRedisTemplate, route(1L, url()));

        String json = capturedValue("1");
        assertTrue(json.contains("\"reachable\":true"));
        assertTrue(json.contains("\"latency_ms\":"));
        assertTrue(json.contains("\"checked_at\":"));
        verify(stringRedisTemplate).expire(eq(UpstreamHealthProbe.HEALTH_KEY), any());
    }

    @Test
    void head4xxIsReachableBut5xxIsNot() {
        headStatus = 404;
        probe.probeOne(stringRedisTemplate, route(1L, url()));
        assertTrue(capturedValue("1").contains("\"reachable\":true"),
                "4xx = 服务在应答，视为可达");

        headStatus = 503;
        probe.probeOne(stringRedisTemplate, route(2L, url()));
        assertTrue(capturedValue("2").contains("\"reachable\":false"),
                "5xx = 不可达");
    }

    @Test
    void headAbortedFallsBackToGet() {
        headAbort = true;
        getStatus = 200;
        probe.probeOne(stringRedisTemplate, route(3L, url()));
        assertTrue(capturedValue("3").contains("\"reachable\":true"),
                "HEAD 断连 → GET 兜底 200 → 可达");
    }

    @Test
    void connectionRefusedWritesUnreachable() {
        server.stop(0);
        probe.probeOne(stringRedisTemplate, route(4L, url()));
        String json = capturedValue("4");
        assertTrue(json.contains("\"reachable\":false"));
    }

    @Test
    void blankUpstreamSkipped() {
        assertDoesNotThrow(() -> probe.probeOne(stringRedisTemplate, route(5L, " ")));
        verify(hashOperations, never()).put(anyString(), any(), any());
    }

    @Test
    void scheduledProbeIteratesPublishedBackendRoutesAndSwallowsError() {
        when(routeService.listRoutes("BACKEND", "PUBLISHED", null))
                .thenReturn(List.of(route(1L, url())));
        assertDoesNotThrow(probe::probeAll);
        verify(hashOperations).put(eq(UpstreamHealthProbe.HEALTH_KEY), eq("1"), anyString());
    }

    @Test
    void scheduledProbeSwallowsRouteListingFailure() {
        when(routeService.listRoutes("BACKEND", "PUBLISHED", null))
                .thenThrow(new RuntimeException("db down"));
        assertDoesNotThrow(probe::probeAll);
        verify(hashOperations, never()).put(anyString(), any(), any());
    }

    @Test
    void readAllParsesJsonAndSkipsBadRows() {
        when(hashOperations.entries(UpstreamHealthProbe.HEALTH_KEY)).thenReturn(Map.of(
                "1", "{\"reachable\":true,\"latency_ms\":9,\"checked_at\":123}",
                "2", "not-json"));
        Map<String, Map<String, Object>> all = probe.readAll();
        assertEquals(1, all.size());
        assertEquals(true, all.get("1").get("reachable"));
    }

    @Test
    void readAllDegradesSilentlyOnRedisFailure() {
        when(hashOperations.entries(UpstreamHealthProbe.HEALTH_KEY))
                .thenThrow(new RedisConnectionFailureException("down"));
        assertTrue(probe.readAll().isEmpty());
    }

    @Test
    void readAllEmptyWhenRedisManagerAbsent() {
        when(redisManagerProvider.getIfAvailable()).thenReturn(null);
        assertTrue(probe.readAll().isEmpty());
    }
}
