package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.RedisConnectionFailureException;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PluginRuntimeStatusServiceTest {

    private static final String KEY = PluginRuntimeStatusService.RUNTIME_KEY;

    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ValueOperations<String, String> valueOperations;

    private PluginRuntimeStatusService service;

    @BeforeEach
    void setUp() {
        service = new PluginRuntimeStatusService(multiRedisManager, new ObjectMapper());
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void readsAndParsesRuntimeArray() {
        when(valueOperations.get(KEY)).thenReturn(
                "[{\"plugin_id\":\"security\",\"phase\":\"PRE\",\"registered\":true,\"updated_at\":1719512345678},"
                        + "{\"plugin_id\":\"cache\",\"phase\":\"PRE\",\"registered\":false,\"updated_at\":1719512345999}]");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.TRUE, result.get("available"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertEquals(2, items.size());
        assertEquals("security", items.get(0).get("plugin_id"));
        assertEquals("PRE", items.get(0).get("phase"));
        assertEquals(Boolean.TRUE, items.get(0).get("registered"));
        assertEquals(1719512345678L, items.get(0).get("updated_at"));
        assertEquals(Boolean.FALSE, items.get(1).get("registered"));
    }

    @Test
    void keyMissingMeansUnknownState() {
        when(valueOperations.get(KEY)).thenReturn(null);

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void blankValueMeansUnknownState() {
        when(valueOperations.get(KEY)).thenReturn("  ");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void redisFailureDegradesInsteadOfThrowing() {
        when(valueOperations.get(KEY)).thenThrow(new RedisConnectionFailureException("conn refused"));

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void datasourceMissingDegradesInsteadOfThrowing() {
        reset(multiRedisManager);
        when(multiRedisManager.getStringRedisTemplate("default"))
                .thenThrow(new fun.commons.framework4j.redis.exception.RedisDataSourceException("数据源 [default] 不存在"));

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void malformedJsonMeansUnknownState() {
        when(valueOperations.get(KEY)).thenReturn("not-a-json{");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void nonArrayJsonMeansUnknownState() {
        when(valueOperations.get(KEY)).thenReturn("{\"plugin_id\":\"security\"}");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.FALSE, result.get("available"));
        assertTrue(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void malformedEntriesAreSkippedButAvailableStaysTrue() {
        when(valueOperations.get(KEY)).thenReturn(
                "[{\"no_plugin_id\":1},{\"plugin_id\":\"jwt\",\"phase\":\"PRE\",\"registered\":true,\"updated_at\":7},"
                        + "\"garbage\"]");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.TRUE, result.get("available"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertEquals(1, items.size());
        assertEquals("jwt", items.get(0).get("plugin_id"));
    }

    @Test
    void missingOptionalFieldsFallBackToDefaults() {
        when(valueOperations.get(KEY)).thenReturn("[{\"plugin_id\":\"mock\"}]");

        Map<String, Object> result = service.readRuntimeStatus();

        assertEquals(Boolean.TRUE, result.get("available"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertEquals("", items.get(0).get("phase"));
        assertEquals(Boolean.FALSE, items.get(0).get("registered"));
        assertEquals(0L, items.get(0).get("updated_at"));
    }
}
