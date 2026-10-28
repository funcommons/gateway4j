package fun.commons.gateway4j.gateway.config;

import fun.commons.framework4j.redis.manager.MultiRedisManager;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MetricsSnapshotPublisherTest {

    private static final String KEY = MetricsSnapshotPublisher.METRICS_SNAPSHOT_KEY;

    @Mock private MultiRedisManager redisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        lenient().when(redisManager.getStringRedisTemplate()).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);
    }

    @Test
    void redisKeyContractStaysVerbatim() {
        assertEquals("gateway4j:metrics:routes", MetricsSnapshotPublisher.METRICS_SNAPSHOT_KEY);
    }

    @Test
    void aggregatesPerPathAcrossPrefixesAndExpiresKey() {
        String path = "/e2e/mtest/**";

        // default prefix
        Counter.builder("gateway4j.requests.total").tag("method", "GET").tag("path", path)
                .register(meterRegistry).increment(3);
        // custom metrics_prefix row → same path tag, values must sum into the same field
        Counter.builder("custom.requests.total").tag("method", "GET").tag("path", path)
                .register(meterRegistry).increment(2);
        Counter.builder("gateway4j.requests.errors").tag("method", "GET").tag("path", path)
                .tag("status", "502").register(meterRegistry).increment();
        Timer latency = Timer.builder("gateway4j.request.latency")
                .tag("method", "GET").tag("path", path).tag("status", "200")
                .register(meterRegistry);
        latency.record(Duration.ofMillis(100));
        latency.record(Duration.ofMillis(50));

        new MetricsSnapshotPublisher(redisManager, meterRegistry).publishSnapshot();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(hashOperations).putAll(eq(KEY), captor.capture());
        // 每轮写完 EXPIRE 60 —— 数据面挂掉后陈旧快照 60s 内自行失效
        verify(stringRedisTemplate).expire(KEY, 60L, TimeUnit.SECONDS);

        Map<String, Object> fields = captor.getValue();
        assertEquals(1, fields.size());
        assertEquals(path, fields.keySet().iterator().next());

        Map<?, ?> value = fun.commons.gateway4j.common.util.JsonUtils
                .parseObject((String) fields.get(path), Map.class);
        assertEquals(5L, asLong(value.get("total")));          // 3 (default prefix) + 2 (custom prefix)
        assertEquals(1L, asLong(value.get("errors")));
        assertEquals(150.0, asDouble(value.get("latency_ms_sum")));
        assertEquals(2L, asLong(value.get("latency_count")));
        assertNotNull(value.get("updated_at"));

        // contract field order for the admin side: total, errors, latency_ms_sum, latency_count, updated_at
        assertIterableEquals(
                java.util.List.of("total", "errors", "latency_ms_sum", "latency_count", "updated_at"),
                ((java.util.LinkedHashMap<?, ?>) value).keySet());
    }

    @Test
    void aggregatesDistinctPathsIntoDistinctFields() {
        Counter.builder("gateway4j.requests.total").tag("method", "GET").tag("path", "/api/a")
                .register(meterRegistry).increment();
        Counter.builder("gateway4j.requests.total").tag("method", "GET").tag("path", "/api/b")
                .register(meterRegistry).increment(7);

        new MetricsSnapshotPublisher(redisManager, meterRegistry).publishSnapshot();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(hashOperations).putAll(eq(KEY), captor.capture());
        Map<String, Object> fields = captor.getValue();
        assertEquals(2, fields.size());
        assertEquals(1L, asLong(((Map<?, ?>) fun.commons.gateway4j.common.util.JsonUtils
                .parseObject((String) fields.get("/api/a"), Map.class)).get("total")));
        assertEquals(7L, asLong(((Map<?, ?>) fun.commons.gateway4j.common.util.JsonUtils
                .parseObject((String) fields.get("/api/b"), Map.class)).get("total")));
    }

    /** Jackson parses small JSON integers as Integer, large as Long — compare via Number. */
    private static long asLong(Object v) {
        return ((Number) v).longValue();
    }

    private static double asDouble(Object v) {
        return ((Number) v).doubleValue();
    }

    @Test
    void ignoresMetersWithoutPathTagAndUnrelatedNames() {
        // no path tag → not indexable, must be skipped
        Counter.builder("gateway4j.requests.total").tag("method", "GET").register(meterRegistry).increment();
        // unrelated meter names (jvm/http server metrics share the registry)
        meterRegistry.counter("jvm.memory.used");
        Counter.builder("gateway4j.other").tag("path", "/api/a").register(meterRegistry).increment();

        new MetricsSnapshotPublisher(redisManager, meterRegistry).publishSnapshot();

        verify(hashOperations, never()).putAll(any(), any());
        verify(stringRedisTemplate, never()).expire(any(String.class), anyLong(), any(TimeUnit.class));
    }

    @Test
    void redisFailureIsSwallowedAndScheduledLoopKeepsRunning() {
        Counter.builder("gateway4j.requests.total").tag("method", "GET").tag("path", "/api/a")
                .register(meterRegistry).increment();
        doThrow(new RedisConnectionFailureException("Connection refused"))
                .when(hashOperations).putAll(eq(KEY), any());

        MetricsSnapshotPublisher publisher = new MetricsSnapshotPublisher(redisManager, meterRegistry);
        // 调度永不退出：本周期失败 + 下一周期（WARN 限频窗口内）都不允许抛出
        assertDoesNotThrow(publisher::publishSnapshot);
        assertDoesNotThrow(publisher::publishSnapshot);
        verify(hashOperations, times(2)).putAll(eq(KEY), any());
    }
}
