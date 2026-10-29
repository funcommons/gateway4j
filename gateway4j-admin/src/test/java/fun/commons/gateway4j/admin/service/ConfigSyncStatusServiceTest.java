package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.admin.mapper.ConfigPushLogMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConfigSyncStatusServiceTest {

    private static final String SYNC_KEY = ConfigSyncStatusService.CONFIG_SYNC_KEY;

    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ValueOperations<String, String> valueOperations;
    @Mock private ConfigPushLogMapper pushLogMapper;

    private ConfigSyncStatusService service;

    @BeforeEach
    void setUp() {
        service = new ConfigSyncStatusService(multiRedisManager, pushLogMapper, new ObjectMapper());
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    /** key 契约逐字固定：gateway4j:config:sync（与 engine/H1 写入侧约定）。 */
    @Test
    void redisKeyContractStaysVerbatim() {
        assertEquals("gateway4j:config:sync", SYNC_KEY);
    }

    /** 水位在且版本追平 → available=true + in_sync=true。 */
    @Test
    void watermarkPresentAndVersionsMatch() {
        when(valueOperations.get(SYNC_KEY)).thenReturn(
                "{\"version\":12,\"fingerprint\":\"abc123\",\"updated_at\":1793000000000,\"instance\":\"gw-1\"}");
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(12L);

        var result = service.readSyncStatus();

        assertEquals(true, result.get("available"));
        assertEquals(12L, result.get("db_version"));
        assertEquals(true, result.get("in_sync"));
        @SuppressWarnings("unchecked")
        var gateway = (java.util.Map<String, Object>) result.get("gateway");
        // Jackson 把无小数点的 JSON 数值反序列化为 Integer，统一按 Number.longValue 比较
        assertEquals(12L, ((Number) gateway.get("version")).longValue());
        assertEquals("abc123", gateway.get("fingerprint"));
        assertEquals(1793000000000L, ((Number) gateway.get("updated_at")).longValue());
        assertEquals("gw-1", gateway.get("instance"));
    }

    /** 版本落后（DB 更新、网关未 reload）→ in_sync=false（发布未生效确认）。 */
    @Test
    void versionMismatchReportsNotInSync() {
        when(valueOperations.get(SYNC_KEY)).thenReturn(
                "{\"version\":10,\"fingerprint\":\"old\",\"updated_at\":1,\"instance\":\"gw-1\"}");
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(11L);

        var result = service.readSyncStatus();

        assertEquals(true, result.get("available"));
        assertEquals(11L, result.get("db_version"));
        assertEquals(false, result.get("in_sync"));
    }

    /** H1 未上线 / TTL 过期 → key 缺失 → available=false、gateway=null、in_sync=false，绝不 500。 */
    @Test
    void missingKeyReportsUnavailable() {
        when(valueOperations.get(SYNC_KEY)).thenReturn(null);
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(7L);

        var result = assertDoesNotThrow(() -> service.readSyncStatus());

        assertEquals(false, result.get("available"));
        assertNull(result.get("gateway"));
        assertEquals(7L, result.get("db_version"));
        assertEquals(false, result.get("in_sync"));
    }

    /** Redis 拒连 → available=false，不抛异常。 */
    @Test
    void redisFailureReportsUnavailableWithoutThrowing() {
        when(valueOperations.get(SYNC_KEY)).thenThrow(new RedisConnectionFailureException("conn refused"));
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(3L);

        var result = assertDoesNotThrow(() -> service.readSyncStatus());

        assertEquals(false, result.get("available"));
        assertEquals(false, result.get("in_sync"));
    }

    /** 坏 JSON → available=false。 */
    @Test
    void malformedWatermarkReportsUnavailable() {
        when(valueOperations.get(SYNC_KEY)).thenReturn("not-json{");

        var result = service.readSyncStatus();

        assertEquals(false, result.get("available"));
    }

    /** DB 查询失败 → db_version 按 0 降级，接口不抛。 */
    @Test
    void dbFailureDegradesToZero() {
        when(valueOperations.get(SYNC_KEY)).thenReturn(
                "{\"version\":5,\"fingerprint\":\"x\",\"updated_at\":1,\"instance\":\"gw-1\"}");
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenThrow(new RuntimeException("db down"));

        var result = assertDoesNotThrow(() -> service.readSyncStatus());

        assertEquals(0L, result.get("db_version"));
        assertEquals(true, result.get("available"));
        assertEquals(false, result.get("in_sync"));
    }
}
