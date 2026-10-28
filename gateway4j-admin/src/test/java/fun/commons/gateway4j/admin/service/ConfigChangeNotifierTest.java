package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.admin.mapper.ConfigPushLogMapper;
import fun.commons.gateway4j.common.model.ConfigPushLog;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 配置变更通知（T2）：channel/payload 契约、operator 解析、Redis 与审计失败不影响主流程。
 */
class ConfigChangeNotifierTest {

    private static final String CHANNEL = "gateway4j:config:changed";

    @Mock private MultiRedisManager redisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ConfigPushLogMapper pushLogMapper;

    private ConfigChangeNotifier notifier;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        notifier = new ConfigChangeNotifier(redisManager, pushLogMapper);
        when(redisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(7L);
    }

    @AfterEach
    void tearDown() throws Exception {
        TokenContext.clear();
        mocks.close();
    }

    @Test
    void publishesContractPayloadOnRouteChange() {
        TokenContext.set("access", java.util.Map.of("username", "admin"));
        long before = System.currentTimeMillis();

        notifier.onConfigChange(new ConfigChangeEvent(this, "ROUTE", 101L, 3L, "PUBLISH"));

        long after = System.currentTimeMillis();
        @SuppressWarnings("unchecked")
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq(CHANNEL), payloadCaptor.capture());

        JsonNode json = parse(payloadCaptor.getValue());
        assertEquals(7, json.get("version").asLong());
        assertEquals("admin", json.get("operator").asText());
        assertEquals("route", json.get("changedType").asText());
        assertTrue(json.get("at").asLong() >= before && json.get("at").asLong() <= after,
                "at 应为 epoch 毫秒且取值合理");

        // 审计：广播成功 → SUCCESS
        ArgumentCaptor<ConfigPushLog> logCaptor = ArgumentCaptor.forClass(ConfigPushLog.class);
        verify(pushLogMapper).insert(logCaptor.capture());
        assertEquals("ROUTE", logCaptor.getValue().getConfigType());
        assertEquals(101L, logCaptor.getValue().getConfigId());
        assertEquals("PUBLISH", logCaptor.getValue().getChangeType());
        assertEquals("SUCCESS", logCaptor.getValue().getPushStatus());
    }

    @Test
    void globalPluginMapsToHyphenatedChangedType() {
        notifier.onConfigChange(new ConfigChangeEvent(this, "GLOBAL_PLUGIN", 5L, 1L, "ENABLE"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq(CHANNEL), payloadCaptor.capture());
        assertEquals("global-plugin", parse(payloadCaptor.getValue()).get("changedType").asText());
    }

    @Test
    void noLoginContextFallsBackToAnonymous() {
        TokenContext.clear();
        notifier.onConfigChange(new ConfigChangeEvent(this, "PLUGIN", 9L, 2L, "CREATE"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq(CHANNEL), payloadCaptor.capture());
        assertEquals("anonymous", parse(payloadCaptor.getValue()).get("operator").asText());
        assertEquals("plugin", parse(payloadCaptor.getValue()).get("changedType").asText());
    }

    @Test
    void redisFailureIsSwallowedAndAuditedAsFailed() {
        doThrow(new IllegalStateException("redis down"))
                .when(stringRedisTemplate).convertAndSend(any(String.class), any(String.class));

        assertDoesNotThrow(() ->
                notifier.onConfigChange(new ConfigChangeEvent(this, "ROUTE", 1L, 1L, "UPDATE")));

        verify(pushLogMapper).insert(any(ConfigPushLog.class));
        ArgumentCaptor<ConfigPushLog> logCaptor = ArgumentCaptor.forClass(ConfigPushLog.class);
        verify(pushLogMapper).insert(logCaptor.capture());
        assertEquals("FAILED", logCaptor.getValue().getPushStatus());
    }

    @Test
    void auditInsertFailureIsSwallowed() {
        when(pushLogMapper.insert(any(ConfigPushLog.class)))
                .thenThrow(new IllegalStateException("no partition"));

        assertDoesNotThrow(() ->
                notifier.onConfigChange(new ConfigChangeEvent(this, "ROUTE", 1L, 1L, "DELETE")));
        verify(stringRedisTemplate).convertAndSend(eq(CHANNEL), any(String.class));
    }

    @Test
    void versionFallsBackToZeroWhenQueryReturnsNull() {
        when(pushLogMapper.selectMaxGlobalConfigVersion()).thenReturn(null);
        notifier.onConfigChange(new ConfigChangeEvent(this, "ROUTE", 1L, 1L, "CREATE"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq(CHANNEL), payloadCaptor.capture());
        assertEquals(0, parse(payloadCaptor.getValue()).get("version").asLong());
    }

    private JsonNode parse(String json) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("payload 不是合法 JSON: " + json, e);
        }
    }
}
