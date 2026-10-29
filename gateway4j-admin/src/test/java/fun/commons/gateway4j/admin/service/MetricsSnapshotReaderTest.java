package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.exception.RedisDataSourceException;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MetricsSnapshotReaderTest {

    private static final String KEY = MetricsSnapshotReader.METRICS_SNAPSHOT_KEY;
    private static final String PATH = "/e2e/mtest/**";

    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOperations;

    private MetricsSnapshotReader reader;

    @BeforeEach
    void setUp() {
        reader = new MetricsSnapshotReader(multiRedisManager, new ObjectMapper());
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForHash()).thenReturn(hashOperations);
    }

    @Test
    void redisKeyContractStaysVerbatim() {
        assertEquals("gateway4j:metrics:routes", MetricsSnapshotReader.METRICS_SNAPSHOT_KEY);
    }

    @Test
    void readsAndParsesSnapshotField() {
        when(hashOperations.get(KEY, PATH)).thenReturn(
                "{\"total\":3,\"errors\":1,\"latency_ms_sum\":150.5,\"latency_count\":2,\"updated_at\":1719512345678}");

        MetricsSnapshotReader.MetricsSnapshot snapshot = reader.readByPath(PATH);

        assertEquals(3L, snapshot.total());
        assertEquals(1L, snapshot.errors());
        assertEquals(150.5, snapshot.latencyMsSum());
        assertEquals(2L, snapshot.latencyCount());
    }

    @Test
    void missingFieldFallsBackToZero() {
        when(hashOperations.get(KEY, PATH)).thenReturn(null);

        MetricsSnapshotReader.MetricsSnapshot snapshot = reader.readByPath(PATH);

        assertEquals(MetricsSnapshotReader.ZERO, snapshot);
    }

    @Test
    void blankValueFallsBackToZero() {
        when(hashOperations.get(KEY, PATH)).thenReturn("  ");

        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(PATH));
    }

    @Test
    void blankPathShortCircuitsWithoutTouchingRedis() {
        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(null));
        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath("  "));
        verifyNoInteractions(stringRedisTemplate);
    }

    @Test
    void redisFailureFallsBackToZeroInsteadOfThrowing() {
        when(hashOperations.get(KEY, PATH)).thenThrow(new RedisConnectionFailureException("conn refused"));

        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(PATH));
    }

    @Test
    void datasourceMissingFallsBackToZeroInsteadOfThrowing() {
        reset(multiRedisManager);
        when(multiRedisManager.getStringRedisTemplate("default"))
                .thenThrow(new RedisDataSourceException("数据源 [default] 不存在"));

        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(PATH));
    }

    @Test
    void malformedJsonFallsBackToZero() {
        when(hashOperations.get(KEY, PATH)).thenReturn("not-a-json{");

        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(PATH));
    }

    @Test
    void nonObjectJsonFallsBackToZero() {
        when(hashOperations.get(KEY, PATH)).thenReturn("[1,2,3]");

        assertEquals(MetricsSnapshotReader.ZERO, reader.readByPath(PATH));
    }

    @Test
    void missingOptionalFieldsFallBackToZeroComponents() {
        when(hashOperations.get(KEY, PATH)).thenReturn("{\"total\":9}");

        MetricsSnapshotReader.MetricsSnapshot snapshot = reader.readByPath(PATH);

        assertEquals(9L, snapshot.total());
        assertEquals(0L, snapshot.errors());
        assertEquals(0.0, snapshot.latencyMsSum());
        assertEquals(0L, snapshot.latencyCount());
    }

    /** P1-1：快照含 active 字段（H1 扩展契约）→ 原样读出在途请求数。 */
    @Test
    void readsActiveFieldWhenPresent() {
        when(hashOperations.get(KEY, PATH)).thenReturn(
                "{\"total\":3,\"errors\":1,\"latency_ms_sum\":150.5,\"latency_count\":2,\"active\":7,\"updated_at\":1}");

        MetricsSnapshotReader.MetricsSnapshot snapshot = reader.readByPath(PATH);

        assertEquals(7L, snapshot.active());
    }

    /** 旧版快照缺 active 字段 → 回退 0（向后兼容）。 */
    @Test
    void missingActiveFieldFallsBackToZero() {
        when(hashOperations.get(KEY, PATH)).thenReturn(
                "{\"total\":3,\"errors\":1,\"latency_ms_sum\":150.5,\"latency_count\":2,\"updated_at\":1}");

        assertEquals(0L, reader.readByPath(PATH).active());
    }
}
