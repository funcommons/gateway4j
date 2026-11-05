package fun.commons.gateway4j.admin.service;

import com.sun.net.httpserver.HttpServer;
import fun.commons.gateway4j.admin.model.V2DebugReplayRequest;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * S11a 影子回放服务单测 —— 契约 docs/ui-v2/实施契约.md S11（2026-11-05 已裁决）。
 * JDK 内置 HttpServer 起本地真端口充当「假网关」（UpstreamHealthProbeTest 先例），
 * 验证转发头 / 口令 / 超时路径与响应 Map 契约；RouteService/RouteSimulateService
 * 全 mock，纯 JUnit5 + Mockito，无 Spring 容器。
 *
 * <p><b>测试先行</b>：被测类尚未实现时本文件会使 admin 测试编译失败——预期 RED，
 * C-agent 按本文件实现 {@code DebugReplayService} 后由 R-agent 跑。</p>
 *
 * <p><b>期望契约（本测试固定）</b>：</p>
 * <pre>
 * public DebugReplayService(RouteService routeService,
 *                           RouteSimulateService simulateService,
 *                           &#64;Value("${gateway4j.debug.gateway-base-url:}") String gatewayBaseUrl,
 *                           &#64;Value("${gateway4j.debug.shadow-token:}") String shadowToken)
 * public Map&lt;String, Object&gt; replay(V2DebugReplayRequest request, Long routeId)
 * </pre>
 * RestClient + SimpleClientHttpRequestFactory（connect 1s / read 3s，
 * MonitorTimeseriesService:276-280 先例）；路由校验用 routeService.getById
 * （MonitorControllerTest:78 同款 mock 口径）。
 *
 * <p><b>行为契约</b>：</p>
 * <ul>
 *   <li>routeId 不存在或路由非 PUBLISHED → BusinessException(ROUTE_NOT_FOUND=10601)；</li>
 *   <li>网关不可达 / 读超时 → BusinessException(SERVICE_UNAVAILABLE=10607)；</li>
 *   <li>转发到 {gateway-base-url}{path}?{query}，携带 {@code X-Gw4j-Shadow: <口令>}
 *       头，method / headers / body 原样；</li>
 *   <li>成功返回 Map：status（数值）、latency_ms（数值 ≥0）、headers（上游响应头）、
 *       body（上游响应体，&gt;64KB 截断为前 65536 字符/字节前缀）、simulate
 *       （RouteSimulateService 预测段原样内嵌）；允许附带额外键。</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class DebugReplayServiceTest {

    private static final String GATEWAY_BASE_URL_PREFIX = "http://127.0.0.1:";
    private static final String SHADOW_TOKEN = "test-shadow-token";

    @Mock private RouteService routeService;
    @Mock private RouteSimulateService simulateService;

    private DebugReplayService service;
    private HttpServer server;

    private final AtomicReference<CapturedCall> captured = new AtomicReference<>();
    private volatile int respondStatus = 201;
    private volatile byte[] respondBody = "ok".getBytes(StandardCharsets.UTF_8);
    /** >0 时假网关延迟应答，用于逼出客户端读超时。 */
    private volatile long sleepMs = 0;

    /** 假网关捕获到的一次调用。 */
    private record CapturedCall(String method, String rawPath, String rawQuery,
                                Map<String, String> headers, String body) {}

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream in = exchange.getRequestBody()) {
                byte[] chunk = new byte[4096];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    buffer.write(chunk, 0, n);
                }
            }
            Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            exchange.getRequestHeaders().forEach(
                    (name, values) -> headers.put(name, values.isEmpty() ? "" : values.get(0)));
            if (sleepMs > 0) {
                try {
                    Thread.sleep(sleepMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
            captured.set(new CapturedCall(exchange.getRequestMethod(),
                    exchange.getRequestURI().getRawPath(),
                    exchange.getRequestURI().getRawQuery(),
                    headers, buffer.toString("UTF-8")));
            exchange.getResponseHeaders().set("X-Upstream-Reply", "pong");
            exchange.sendResponseHeaders(respondStatus, respondBody.length);
            try (var out = exchange.getResponseBody()) {
                out.write(respondBody);
            }
        });
        server.start();
        service = new DebugReplayService(routeService, simulateService,
                GATEWAY_BASE_URL_PREFIX + server.getAddress().getPort(), SHADOW_TOKEN);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private Route route(long id, String status) {
        return Route.builder().id(id).routeName("r" + id).routeType("BACKEND")
                .path("/api/**").upstreamUrl("http://127.0.0.1:9").status(status)
                .environment("prod").build();
    }

    private Map<String, Object> replayWith(Long routeId, Route route, V2DebugReplayRequest request) {
        if (routeId != null && route != null) {
            when(routeService.getById(routeId)).thenReturn(route);
        }
        return service.replay(request, routeId);
    }

    // ==================== 路由校验（契约细则③） ====================

    /** routeId 不存在 → BusinessException(ROUTE_NOT_FOUND, 10601)。 */
    @Test
    void unknownRouteIdThrowsRouteNotFound() {
        when(routeService.getById(99L)).thenReturn(null);

        BusinessException thrown = assertThrows(BusinessException.class,
                () -> service.replay(simpleGet(), 99L));

        assertEquals(ErrorCode.ROUTE_NOT_FOUND, thrown.getErrorCode());
        assertEquals(10601, thrown.getCode());
    }

    /** 路由非 PUBLISHED（DRAFT / OFFLINE）→ 同样按 ROUTE_NOT_FOUND 处理。 */
    @Test
    void nonPublishedRouteThrowsRouteNotFound() {
        when(routeService.getById(7L)).thenReturn(route(7L, "DRAFT"));
        BusinessException draft = assertThrows(BusinessException.class,
                () -> service.replay(simpleGet(), 7L));
        assertEquals(ErrorCode.ROUTE_NOT_FOUND, draft.getErrorCode());

        when(routeService.getById(8L)).thenReturn(route(8L, "OFFLINE"));
        BusinessException offline = assertThrows(BusinessException.class,
                () -> service.replay(simpleGet(), 8L));
        assertEquals(ErrorCode.ROUTE_NOT_FOUND, offline.getErrorCode());
    }

    // ==================== 网关不可达 / 读超时（契约细则④） ====================

    @Test
    void unreachableGatewayThrowsServiceUnavailable() {
        when(routeService.getById(7L)).thenReturn(route(7L, "PUBLISHED"));
        server.stop(0);

        BusinessException thrown = assertThrows(BusinessException.class,
                () -> service.replay(simpleGet(), 7L));

        assertEquals(ErrorCode.SERVICE_UNAVAILABLE, thrown.getErrorCode());
        assertEquals(10607, thrown.getCode());
    }

    /** 假网关延迟 3.5s 应答 → 客户端 read 3s 超时 → SERVICE_UNAVAILABLE（不静默吞）。 */
    @Test
    void slowUpstreamHitsReadTimeoutAsServiceUnavailable() {
        when(routeService.getById(7L)).thenReturn(route(7L, "PUBLISHED"));
        sleepMs = 3500;

        BusinessException thrown = assertThrows(BusinessException.class,
                () -> service.replay(simpleGet(), 7L),
                "读超时必须转为 SERVICE_UNAVAILABLE，而不是返回部分结果");

        assertEquals(ErrorCode.SERVICE_UNAVAILABLE, thrown.getErrorCode());
    }

    // ==================== 转发保真（契约细则①③） ====================

    @Test
    void forwardsMethodPathQueryHeadersBodyAndShadowHeader() {
        Map<String, Object> simulateStub = simulateStub();
        when(simulateService.simulate("/api/users", "POST",
                Map.of("X-Custom-Trace", "t1", "Content-Type", "application/json"),
                Map.of("a", "1", "b", "2")))
                .thenReturn(simulateStub);
        when(routeService.getById(7L)).thenReturn(route(7L, "PUBLISHED"));

        V2DebugReplayRequest request = new V2DebugReplayRequest(
                "/api/users", "POST",
                Map.of("X-Custom-Trace", "t1", "Content-Type", "application/json"),
                Map.of("a", "1", "b", "2"),
                "{\"k\":1}");
        assertDoesNotThrow(() -> service.replay(request, 7L));

        CapturedCall call = captured.get();
        assertNotNull(call, "请求必须真实到达 {gateway-base-url}{path}?{query}");
        assertEquals("POST", call.method(), "method 必须原样转发");
        assertEquals("/api/users", call.rawPath(), "path 必须原样拼接到 gateway-base-url 后");
        assertEquals(new LinkedHashSet<>(Arrays.asList("a=1", "b=2")),
                new LinkedHashSet<>(Arrays.asList(call.rawQuery().split("&"))),
                "query 必须拼接为查询串（键值对一致即可，顺序不敏感）");
        assertEquals(SHADOW_TOKEN, call.headers().get("X-Gw4j-Shadow"),
                "转发必须携带 X-Gw4j-Shadow: <shadow-token>（引擎据此识别影子请求）");
        assertEquals("t1", call.headers().get("X-Custom-Trace"), "请求头必须原样转发");
        assertTrue(call.headers().get("Content-Type").startsWith("application/json"),
                "Content-Type 必须原样转发");
        assertEquals("{\"k\":1}", call.body(), "body 必须原样转发");
    }

    // ==================== 成功响应 Map 契约（契约细则③） ====================

    @Test
    void successMapCarriesStatusLatencyHeadersBodyAndSimulate() {
        Map<String, Object> simulateStub = simulateStub();
        when(simulateService.simulate("/api/users", "GET",
                Map.of("X-Custom-Trace", "t1"), Map.of("a", "1")))
                .thenReturn(simulateStub);
        respondStatus = 201;
        respondBody = "created".getBytes(StandardCharsets.UTF_8);

        Map<String, Object> result = replayWith(7L, route(7L, "PUBLISHED"),
                new V2DebugReplayRequest("/api/users", "GET",
                        Map.of("X-Custom-Trace", "t1"), Map.of("a", "1"), null));

        assertNotNull(result);
        Object status = result.get("status");
        int statusValue = status instanceof Number n ? n.intValue()
                : Integer.parseInt(String.valueOf(status));
        assertEquals(201, statusValue, "status 必须是上游真实状态码");
        assertTrue(((Number) result.get("latency_ms")).longValue() >= 0,
                "latency_ms 必须是数值型回放耗时");
        assertEquals("pong", headerOf(result, "X-Upstream-Reply"),
                "headers 必须包含上游响应头");
        assertEquals("created", result.get("body"), "body 必须是上游响应体");
        assertSame(simulateStub, result.get("simulate"),
                "simulate 预测段必须原样内嵌 RouteSimulateService 的返回（不做拷贝改造）");
    }

    /** 上游响应体 >64KB 时截断为前 65536 的前缀（ASCII 夹具，字符/字节口径一致）。 */
    @Test
    void oversizedResponseBodyTruncatedTo64KiBPrefix() {
        Map<String, Object> simulateStub = simulateStub();
        when(simulateService.simulate("/api/users", "GET", Map.of(), Map.of()))
                .thenReturn(simulateStub);
        String big = "x".repeat(100_000);
        respondBody = big.getBytes(StandardCharsets.UTF_8);

        Map<String, Object> result = replayWith(7L, route(7L, "PUBLISHED"),
                new V2DebugReplayRequest("/api/users", "GET", Map.of(), Map.of(), null));

        String body = String.valueOf(result.get("body"));
        assertTrue(body.length() <= 65_536, "响应体必须截断到 64KB 以内，实测 " + body.length());
        assertEquals(big.substring(0, body.length()), body,
                "截断必须是上游响应体的前缀（不夹带省略标记）");
    }

    // ==================== 网关非 2xx 原样回传（V 轮实播评审缺陷①回归） ====================

    /** 假网关返回 500 + 错误体 → 必须进结果路径（status/body 原样），不得抛 BusinessException(10607)。 */
    @Test
    void gateway500IsReturnedAsResultNotMappedToServiceUnavailable() {
        Map<String, Object> simulateStub = simulateStub();
        when(simulateService.simulate("/api/users", "GET", Map.of(), Map.of()))
                .thenReturn(simulateStub);
        when(routeService.getById(7L)).thenReturn(route(7L, "PUBLISHED"));
        respondStatus = 500;
        respondBody = "{\"code\":\"GW_INTERNAL\"}".getBytes(StandardCharsets.UTF_8);

        Map<String, Object> result = assertDoesNotThrow(() ->
                service.replay(new V2DebugReplayRequest("/api/users", "GET", Map.of(), Map.of(), null), 7L),
                "网关 5xx 是上游真实响应，必须原样回传而不是误判为网关不可达(10607)");

        Object status = result.get("status");
        int statusValue = status instanceof Number n ? n.intValue()
                : Integer.parseInt(String.valueOf(status));
        assertEquals(500, statusValue, "status 必须是上游真实状态码 500");
        assertEquals("{\"code\":\"GW_INTERNAL\"}", result.get("body"), "body 必须是上游错误体原样");
        assertEquals("pong", headerOf(result, "X-Upstream-Reply"), "headers 照常携带上游响应头");
        assertTrue(((Number) result.get("latency_ms")).longValue() >= 0, "latency_ms 照记");
        assertSame(simulateStub, result.get("simulate"), "simulate 预测段照常内嵌");
    }

    /** 假网关返回 404 → 同样原样回传（契约：任何网关 HTTP 响应都不抛、不误判不可达）。 */
    @Test
    void gateway404IsReturnedAsResultToo() {
        Map<String, Object> simulateStub = simulateStub();
        when(simulateService.simulate("/api/users", "GET", Map.of(), Map.of()))
                .thenReturn(simulateStub);
        when(routeService.getById(7L)).thenReturn(route(7L, "PUBLISHED"));
        respondStatus = 404;
        respondBody = "nope".getBytes(StandardCharsets.UTF_8);

        Map<String, Object> result = assertDoesNotThrow(() ->
                service.replay(new V2DebugReplayRequest("/api/users", "GET", Map.of(), Map.of(), null), 7L));

        Object status = result.get("status");
        int statusValue = status instanceof Number n ? n.intValue()
                : Integer.parseInt(String.valueOf(status));
        assertEquals(404, statusValue, "4xx 同样原样回传真实状态码");
        assertEquals("nope", result.get("body"), "4xx body 同样原样回传");
        assertEquals("pong", headerOf(result, "X-Upstream-Reply"), "4xx headers 照常携带上游响应头");
    }

    // ==================== fixture 工具 ====================

    private V2DebugReplayRequest simpleGet() {
        return new V2DebugReplayRequest("/api/users", "GET", Map.of(), Map.of(), null);
    }

    private Map<String, Object> simulateStub() {
        Map<String, Object> stub = new LinkedHashMap<>();
        stub.put("matched", true);
        stub.put("route", Map.of("id", "7"));
        return stub;
    }

    /** 响应 Map 中 headers 键的大小写不敏感查找（值兼容 String 与 List）。 */
    private static String headerOf(Map<String, Object> result, String name) {
        Object headers = result.get("headers");
        assertTrue(headers instanceof Map, "headers 必须是 Map");
        for (Map.Entry<?, ?> entry : ((Map<?, ?>) headers).entrySet()) {
            if (String.valueOf(entry.getKey()).equalsIgnoreCase(name)) {
                Object value = entry.getValue();
                if (value instanceof List<?> list) {
                    return list.isEmpty() ? null : String.valueOf(list.get(0));
                }
                return String.valueOf(value);
            }
        }
        return null;
    }
}
