package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.admin.model.V2DebugReplayRequest;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * S11a 影子回放服务（UI v2 契约 docs/ui-v2/实施契约.md S11，2026-11-05 已裁决）：
 * 把调试台构造的请求<b>真实转发</b>到网关数据面（携带 {@code X-Gw4j-Shadow} 口令头，
 * 引擎据此豁免统计、插件链照跑），并内嵌 {@link RouteSimulateService} 的静态预测段。
 *
 * <p>行为口径：</p>
 * <ul>
 *   <li>route_id 仅 admin 侧校验（数据面无 route_id 直查，path 首命中）：不存在或
 *       非 PUBLISHED → {@link BusinessException}(ROUTE_NOT_FOUND=10601)；</li>
 *   <li>网关不可达 / connect 1s、read 3s 超时 →
 *       {@link BusinessException}(SERVICE_UNAVAILABLE=10607)；</li>
 *   <li>响应 Map（snake_case）：{@code status}（上游真实状态码）、{@code latency_ms}
 *       （回放墙钟 ≥0）、{@code headers}（上游响应头）、{@code body}（响应体，&gt;64KB
 *       截断为前 65536 字符前缀）、{@code simulate}（预测段原样内嵌，不做拷贝改造）。</li>
 * </ul>
 */
@Slf4j
@Service
public class DebugReplayService {

    /** 连接超时 1s（MonitorTimeseriesService buildPrometheusClient 同款 HttpClient 基座）。 */
    private static final int CONNECT_TIMEOUT_MS = 1000;
    /** 读超时 3s：调试回放不能把管理线程挂死在上游。 */
    private static final int READ_TIMEOUT_MS = 3000;
    /** 响应体截断上限 64KB（=65536 字符前缀）。 */
    static final int MAX_BODY_CHARS = 64 * 1024;

    private final RouteService routeService;
    private final RouteSimulateService simulateService;
    private final String gatewayBaseUrl;
    private final String shadowToken;
    private final RestClient restClient;

    public DebugReplayService(RouteService routeService,
                              RouteSimulateService simulateService,
                              @Value("${gateway4j.debug.gateway-base-url:}") String gatewayBaseUrl,
                              @Value("${gateway4j.debug.shadow-token:}") String shadowToken) {
        this.routeService = routeService;
        this.simulateService = simulateService;
        this.gatewayBaseUrl = gatewayBaseUrl;
        this.shadowToken = shadowToken;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * 回放一次调试请求。
     *
     * @param request 回放请求体（path/method/headers/query/body）
     * @param routeId 目标路由 id（仅做 PUBLISHED 校验，转发走网关正常决策）
     * @return status/latency_ms/headers/body/simulate 五键响应 Map
     */
    public Map<String, Object> replay(V2DebugReplayRequest request, Long routeId) {
        validateRoute(routeId);

        Map<String, String> headers = request.headers() == null ? Map.of() : request.headers();
        Map<String, String> query = request.query() == null ? Map.of() : request.query();

        Map<String, Object> result = new LinkedHashMap<>();
        // 预测段先行（纯 DB 聚合，不触达上游），结果原样内嵌（契约：不做拷贝改造）
        result.put("simulate", simulateService.simulate(request.path(), request.method(), headers, query));

        String method = request.method() == null || request.method().isBlank()
                ? "GET" : request.method().toUpperCase();
        URI uri = buildUri(request.path(), query);

        long start = System.nanoTime();
        ResponseEntity<String> entity;
        try {
            RestClient.RequestBodySpec spec = restClient.method(HttpMethod.valueOf(method))
                    .uri(uri)
                    .headers(httpHeaders -> {
                        headers.forEach(httpHeaders::add);
                        if (shadowToken != null && !shadowToken.isBlank()) {
                            httpHeaders.add(GatewayConstants.SHADOW_HEADER, shadowToken);
                        }
                    });
            RestClient.RequestHeadersSpec<?> headersSpec = request.body() == null
                    ? spec : spec.body(request.body());
            // 4xx/5xx 不抛：上游真实状态码原样回传给调试台
            entity = headersSpec.retrieve()
                    .onStatus(ignored -> false, (req, res) -> { })
                    .toEntity(String.class);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[调试回放] 网关不可达/超时（{}{}）: {}", gatewayBaseUrl, request.path(), e.toString());
            throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, e.getClass().getSimpleName());
        }
        long latencyMs = Math.max(0, (System.nanoTime() - start) / 1_000_000);

        result.put("status", entity.getStatusCode().value());
        result.put("latency_ms", latencyMs);
        Map<String, Object> responseHeaders = new LinkedHashMap<>();
        entity.getHeaders().forEach((name, values) ->
                responseHeaders.put(name, values == null || values.isEmpty() ? "" : values.get(0)));
        result.put("headers", responseHeaders);
        String body = entity.getBody();
        result.put("body", body != null && body.length() > MAX_BODY_CHARS
                ? body.substring(0, MAX_BODY_CHARS) : body);
        return result;
    }

    /** route_id 仅 admin 侧校验：不存在 / 非 PUBLISHED（DRAFT/OFFLINE）→ ROUTE_NOT_FOUND。 */
    private void validateRoute(Long routeId) {
        if (routeId == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        Route route = routeService.getById(routeId);
        if (route == null || !"PUBLISHED".equals(route.getStatus())) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
    }

    /** {gateway-base-url}{path}?{query}：path 原样拼接，query 走 form URL 编码（顺序不敏感）。 */
    private URI buildUri(String path, Map<String, String> query) {
        StringBuilder sb = new StringBuilder(gatewayBaseUrl == null ? "" : gatewayBaseUrl);
        if (path == null || path.isEmpty()) {
            sb.append('/');
        } else {
            if (!gatewayBaseUrl.endsWith("/") && !path.startsWith("/")) {
                sb.append('/');
            }
            sb.append(path);
        }
        if (!query.isEmpty()) {
            StringBuilder qs = new StringBuilder();
            for (Map.Entry<String, String> entry : query.entrySet()) {
                if (qs.length() > 0) {
                    qs.append('&');
                }
                qs.append(URLEncoder.encode(entry.getKey() == null ? "" : entry.getKey(), StandardCharsets.UTF_8))
                        .append('=')
                        .append(URLEncoder.encode(entry.getValue() == null ? "" : entry.getValue(),
                                StandardCharsets.UTF_8));
            }
            sb.append('?').append(qs);
        }
        return URI.create(sb.toString());
    }
}
