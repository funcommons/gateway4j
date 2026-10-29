package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import fun.commons.gateway4j.common.util.JsonUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 监控指标 SSE 推送（P2-7）：/v1/monitor/stream 的事件源。
 *
 * <p>事件两类（事件名固定给前端 EventSource.addEventListener 使用）：</p>
 * <ul>
 *   <li>{@code metrics} —— 每 5s 节流推 routes/status 摘要
 *       {@code {"routes_total":N,"error_count":N,"total_requests":N,"at":epoch}}；</li>
 *   <li>{@code config_changed} —— 挂既有 ConfigChangeEvent，
 *       推 {@code {"type":"route|plugin|global-plugin","at":epoch}}。</li>
 * </ul>
 *
 * <p>data 均为 JSON 字符串。Emitter 注册表用 COW 列表；发送异常/完成/超时一律
 * 踢除并清理，广播永不抛出（监控推送失败不影响主流程）。</p>
 */
@Slf4j
@Service
public class MonitorStreamService {

    /** metrics 节流周期（毫秒）。 */
    public static final long METRICS_INTERVAL_MS = 5_000;

    private final RouteService routeService;
    private final MonitorTimeseriesService timeseriesService;
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public MonitorStreamService(RouteService routeService, MonitorTimeseriesService timeseriesService) {
        this.routeService = routeService;
        this.timeseriesService = timeseriesService;
    }

    /**
     * 注册新客户端（token 校验已在 controller 完成）。timeout=0 不限时，
     * 断开由 onError/onCompletion/onTimeout 回调清理。
     *
     * <p>不做注册即推：controller 返回后 MVC 才初始化 emitter，此前 send 必然
     * IllegalStateException——首个事件由 5s 定时群发兜底，最迟 5s 到达。</p>
     */
    public SseEmitter register() {
        return register(new SseEmitter(0L));
    }

    /** 注册入口（可注入 emitter 便于单测）。 */
    SseEmitter register(SseEmitter emitter) {
        Runnable cleanup = () -> emitters.remove(emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        emitters.add(emitter);
        return emitter;
    }

    /** 当前连接数（运维观测用）。 */
    public int subscriberCount() {
        return emitters.size();
    }

    /** 每 5s 群发 metrics 摘要（无订阅者时空转）。 */
    @Scheduled(fixedDelay = METRICS_INTERVAL_MS, initialDelay = METRICS_INTERVAL_MS)
    public void broadcastMetrics() {
        if (emitters.isEmpty()) {
            return;
        }
        String payload = JsonUtils.toCompactJson(buildMetricsSummary());
        for (SseEmitter emitter : emitters) {
            send(emitter, "metrics", payload);
        }
    }

    /** 配置变更 → config_changed 事件（挂既有 ConfigChangeEvent，不感知事务时机）。 */
    @EventListener
    public void onConfigChange(ConfigChangeEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", toType(event.getConfigType()));
        payload.put("at", System.currentTimeMillis());
        String json = JsonUtils.toCompactJson(payload);
        for (SseEmitter emitter : emitters) {
            send(emitter, "config_changed", json);
        }
    }

    /** routes/status 摘要：总数/异常数/总请求（口径与 MonitorController#buildStatus 一致）。 */
    Map<String, Object> buildMetricsSummary() {
        int errorCount = 0;
        long totalRequests = 0;
        java.util.List<Route> routes = routeService.listRoutes(null, null, null);
        for (Route route : routes) {
            MonitorTimeseriesService.PathMetrics metrics =
                    timeseriesService.pathStatusMetrics(route.getPath());
            totalRequests += metrics.total();
            if (metrics.total() > 0 && metrics.errorRate() > 0.05) {
                errorCount++;
            }
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("routes_total", routes.size());
        summary.put("error_count", errorCount);
        summary.put("total_requests", totalRequests);
        summary.put("at", System.currentTimeMillis());
        return summary;
    }

    /** ROUTE→route，PLUGIN→plugin，GLOBAL_PLUGIN→global-plugin（与 Redis 广播口径一致）。 */
    private String toType(String configType) {
        return configType == null ? "route" : configType.toLowerCase().replace('_', '-');
    }

    /** 单发 + 异常踢除（客户端断开/写失败），绝不向上抛。 */
    private void send(SseEmitter emitter, String event, String jsonPayload) {
        try {
            emitter.send(SseEmitter.event().name(event).data(jsonPayload));
        } catch (Exception e) {
            emitters.remove(emitter);
            log.debug("[SSE] 推送失败踢除客户端（event={}）: {}", event, e.getMessage());
        }
    }
}
