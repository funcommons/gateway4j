package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P2-7 SSE 推送单测：注册表、metrics 群发、config_changed 挂事件、断连踢除。
 */
@ExtendWith(MockitoExtension.class)
class MonitorStreamServiceTest {

    @Mock private RouteService routeService;
    @Mock private MonitorTimeseriesService timeseriesService;

    private MonitorStreamService service;

    @BeforeEach
    void setUp() {
        service = new MonitorStreamService(routeService, timeseriesService);
        lenient().when(routeService.listRoutes(null, null, null)).thenReturn(List.of(
                Route.builder().id(1L).routeName("ok").routeType("BACKEND").path("/ok").build(),
                Route.builder().id(2L).routeName("bad").routeType("BACKEND").path("/bad").build()));
        lenient().when(timeseriesService.pathStatusMetrics("/ok"))
                .thenReturn(new MonitorTimeseriesService.PathMetrics(10, 0, 0.0, 0));
        lenient().when(timeseriesService.pathStatusMetrics("/bad"))
                .thenReturn(new MonitorTimeseriesService.PathMetrics(10, 5, 0.5, 0));
    }

    @Test
    void registerAddsSubscriber() {
        service.register(mock(SseEmitter.class));
        assertEquals(1, service.subscriberCount());
    }

    @Test
    void metricsSummaryShapeAndSemantics() {
        // 异常路由口径与 /v1/monitor/routes/status 一致：total>0 且 errorRate>0.05
        Map<String, Object> summary = service.buildMetricsSummary();
        assertEquals(2, summary.get("routes_total"));
        assertEquals(1, summary.get("error_count"));
        assertEquals(20L, summary.get("total_requests"));
        assertNotNull(summary.get("at"));
    }

    @Test
    void broadcastMetricsSendsToAllSubscribers() throws Exception {
        SseEmitter e1 = mock(SseEmitter.class);
        SseEmitter e2 = mock(SseEmitter.class);
        service.register(e1);
        service.register(e2);

        service.broadcastMetrics();

        verify(e1, times(1)).send(any(SseEmitter.SseEventBuilder.class));
        verify(e2, times(1)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void sendFailureEvictsSubscriber() throws Exception {
        SseEmitter dead = mock(SseEmitter.class);
        SseEmitter alive = mock(SseEmitter.class);
        doThrow(new IOException("broken pipe")).when(dead)
                .send(any(SseEmitter.SseEventBuilder.class));
        service.register(dead);
        service.register(alive);

        service.broadcastMetrics();

        assertEquals(1, service.subscriberCount(), "断连客户端应被踢除");
    }

    @Test
    void configChangeEventBroadcastsConfigChanged() throws Exception {
        SseEmitter subscriber = mock(SseEmitter.class);
        service.register(subscriber);

        service.onConfigChange(new ConfigChangeEvent(this, "ROUTE", 1L, 0L, "UPDATE"));

        verify(subscriber, times(1)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void broadcastWithNoSubscribersIsNoop() {
        assertDoesNotThrow(() -> service.broadcastMetrics());
        assertDoesNotThrow(() -> service.onConfigChange(
                new ConfigChangeEvent(this, "PLUGIN", 1L, 0L, "CREATE")));
    }

    @Test
    void configChangeSendFailureEvictsQuietly() throws Exception {
        SseEmitter dead = mock(SseEmitter.class);
        doThrow(new IOException("broken pipe")).when(dead)
                .send(any(SseEmitter.SseEventBuilder.class));
        service.register(dead);

        assertDoesNotThrow(() -> service.onConfigChange(
                new ConfigChangeEvent(this, "GLOBAL_PLUGIN", 1L, 0L, "ENABLE")));
        assertEquals(0, service.subscriberCount());
    }
}
