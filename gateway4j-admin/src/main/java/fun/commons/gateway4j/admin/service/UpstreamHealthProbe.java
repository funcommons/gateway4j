package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.util.JsonUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 上游主动探测（P2-6 第一阶）：每 30s 对全部 PUBLISHED BACKEND 路由的
 * {@code upstream_url} 发 HEAD（5s 超时；失败 GET 兜底一次——不少实现不支持 HEAD），
 * 结果写 Redis HASH {@code gateway4j:upstream:health}：
 * <pre>
 * key   = gateway4j:upstream:health
 * field = route_id
 * value = {"reachable":bool,"latency_ms":N,"checked_at":epoch_ms}
 * TTL   = 90s（key 级，探测停摆后自动过期，避免僵尸健康态）
 * </pre>
 *
 * <p><b>可达口径</b>：HTTP 应答 status &lt; 500（含 3xx/4xx——只要服务在应答即视为
 * 可达；4xx 多为鉴权/路径语义，不代表实例宕机）；连接拒绝/超时/5xx = 不可达。</p>
 *
 * <p><b>容错</b>：调度级异常一律吞掉 + 限频日志（同因 60s 内只记一次），绝不影响
 * 管理面主流程；探测整体失败时 HASH 自然过期，前端读到 upstream=null。</p>
 */
@Slf4j
@Service
public class UpstreamHealthProbe {

    /** Redis HASH key（/v1/monitor/routes/status 的 upstream 字段同源读取）。 */
    public static final String HEALTH_KEY = "gateway4j:upstream:health";

    /** 单次探测超时（HEAD 与兜底 GET 各自计时）。 */
    static final Duration TIMEOUT = Duration.ofSeconds(5);

    /** HASH key TTL：略大于探测间隔，停摆后快速失效。 */
    static final Duration TTL = Duration.ofSeconds(90);

    /** 同因异常日志限频窗口。 */
    static final long ERROR_LOG_INTERVAL_MS = 60_000;

    private final RouteService routeService;
    private final ObjectProvider<MultiRedisManager> redisManagers;
    private final HttpClient httpClient;
    private volatile long lastErrorLogAt = 0L;

    @org.springframework.beans.factory.annotation.Autowired
    public UpstreamHealthProbe(RouteService routeService,
                               ObjectProvider<MultiRedisManager> redisManagers) {
        this.routeService = routeService;
        this.redisManagers = redisManagers;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                // 3xx 不跟随：既把重定向目标视为可达，也避免探测被引到外网
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    /** 测试注入点：给定预构建 HttpClient。 */
    UpstreamHealthProbe(RouteService routeService,
                        ObjectProvider<MultiRedisManager> redisManagers,
                        HttpClient httpClient) {
        this.routeService = routeService;
        this.redisManagers = redisManagers;
        this.httpClient = httpClient;
    }

    /**
     * 每 30s 一轮（fixedDelay：上一轮结束后再计时，慢轮不堆积）。
     * initialDelay 15s：错开启动期 Flyway/缓存预热高峰。
     */
    @Scheduled(fixedDelay = 30_000, initialDelay = 15_000)
    public void probeAll() {
        try {
            MultiRedisManager redis = redisManagers.getIfAvailable();
            if (redis == null) {
                return;
            }
            List<Route> routes = routeService.listRoutes("BACKEND", "PUBLISHED", null);
            if (routes == null || routes.isEmpty()) {
                return;
            }
            StringRedisTemplate template = redis.getStringRedisTemplate("default");
            for (Route route : routes) {
                try {
                    probeOne(template, route);
                } catch (Exception e) {
                    logThrottled("单路由探测失败（route_id={}，吞掉继续）: {}",
                            route.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            logThrottled("上游探测调度异常（吞掉，不影响主流程）: {}", e.getMessage());
        }
    }

    /** 单路由探测 + 写 HASH。package-private 便于单测。 */
    void probeOne(StringRedisTemplate template, Route route) {
        String url = route.getUpstreamUrl();
        if (url == null || url.isBlank()) {
            return;
        }
        long start = System.currentTimeMillis();
        boolean reachable;
        try {
            HttpRequest head = HttpRequest.newBuilder(URI.create(url.trim()))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .timeout(TIMEOUT)
                    .build();
            reachable = isReachable(httpClient.send(head, HttpResponse.BodyHandlers.discarding()));
        } catch (Exception headFailed) {
            // HEAD 失败 GET 兜底一次（仅 IO/5xx 失败值得兜底，语义统一从简）
            try {
                HttpRequest get = HttpRequest.newBuilder(URI.create(url.trim()))
                        .GET()
                        .timeout(TIMEOUT)
                        .build();
                reachable = isReachable(httpClient.send(get, HttpResponse.BodyHandlers.discarding()));
            } catch (Exception getFailed) {
                reachable = false;
            }
        }
        long latency = System.currentTimeMillis() - start;
        writeHealth(template, String.valueOf(route.getId()), reachable, latency);
    }

    private void writeHealth(StringRedisTemplate template, String routeId,
                             boolean reachable, long latencyMs) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("reachable", reachable);
        value.put("latency_ms", latencyMs);
        value.put("checked_at", System.currentTimeMillis());
        template.opsForHash().put(HEALTH_KEY, routeId, JsonUtils.toCompactJson(value));
        template.expire(HEALTH_KEY, TTL);
    }

    private boolean isReachable(HttpResponse<Void> response) {
        return response.statusCode() < 500;
    }

    /** 异常限频日志：同因 60s 内只记一次 WARN。 */
    private void logThrottled(String pattern, Object... args) {
        long now = System.currentTimeMillis();
        if (now - lastErrorLogAt >= ERROR_LOG_INTERVAL_MS) {
            lastErrorLogAt = now;
            log.warn(pattern, args);
        }
    }

    /**
     * 读取全部健康态（route_id → {reachable,latency_ms,checked_at}）。
     * key 不存在/Redis 拒连/坏 JSON 一律返回空 Map，绝不抛（监控接口静默降级 null）。
     */
    public Map<String, Map<String, Object>> readAll() {
        try {
            MultiRedisManager redis = redisManagers.getIfAvailable();
            if (redis == null) {
                return Map.of();
            }
            Map<Object, Object> entries = redis.getStringRedisTemplate("default")
                    .opsForHash().entries(HEALTH_KEY);
            Map<String, Map<String, Object>> result = new LinkedHashMap<>();
            if (entries == null) {
                return result;
            }
            for (Map.Entry<Object, Object> entry : entries.entrySet()) {
                if (!(entry.getValue() instanceof String json) || json.isBlank()) {
                    continue;
                }
                try {
                    Map<String, Object> parsed = JsonUtils.parseObject(json, Map.class);
                    if (parsed != null) {
                        result.put(String.valueOf(entry.getKey()), parsed);
                    }
                } catch (Exception badRow) {
                    log.warn("[上游探测] 健康值解析失败（field={}）: {}",
                            entry.getKey(), badRow.getMessage());
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("[上游探测] 健康态读取失败（Redis 不可达？），按空处理: {}", e.getMessage());
            return Map.of();
        }
    }
}
