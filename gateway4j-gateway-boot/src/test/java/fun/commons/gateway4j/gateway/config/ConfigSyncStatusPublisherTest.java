package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.env.MockEnvironment;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConfigSyncStatusPublisherTest {

    @Mock private MultiRedisManager redisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private org.springframework.data.redis.core.ValueOperations<String, String> valueOperations;

    @BeforeEach
    void setUp() {
        lenient().when(redisManager.getStringRedisTemplate()).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    private ConfigLoadedEvent event(long maxVersion) {
        Plugin row = Plugin.builder().id(1L).pluginId("security").pluginPhase("PRE")
                .scope("GLOBAL").status("ENABLED").sortOrder(1).build();
        return new ConfigLoadedEvent(this, List.of(row), maxVersion);
    }

    @Test
    void redisKeyContractStaysVerbatim() {
        assertEquals("gateway4j:config:sync", ConfigSyncStatusPublisher.CONFIG_SYNC_KEY);
    }

    @Test
    void publishesVersionFingerprintInstanceWithTtl120() {
        ConfigSyncService syncService = new ConfigSyncService(() -> 4242L);
        syncService.checkVersion(); // seeds the local fingerprint (as configInitializer does)

        ConfigSyncStatusPublisher publisher = new ConfigSyncStatusPublisher(
                redisManager, syncService, new MockEnvironment().withProperty("server.port", "9400"));
        publisher.onConfigLoaded(event(7L));

        ArgumentCaptor<String> value = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(
                eq(ConfigSyncStatusPublisher.CONFIG_SYNC_KEY), value.capture(), eq(Duration.ofSeconds(120L)));

        Map<?, ?> json = fun.commons.gateway4j.common.util.JsonUtils.parseObject(value.getValue(), Map.class);
        assertEquals(7L, ((Number) json.get("version")).longValue(), "version = max config_version");
        assertEquals("4242", String.valueOf(json.get("fingerprint")), "fingerprint = content fingerprint (string)");
        assertNotNull(json.get("updated_at"));
        assertTrue(String.valueOf(json.get("instance")).endsWith(":9400"), json.get("instance").toString());

        // contract field order: version, fingerprint, updated_at, instance
        assertIterableEquals(List.of("version", "fingerprint", "updated_at", "instance"),
                ((java.util.LinkedHashMap<?, ?>) json).keySet());
    }

    @Test
    void reloadAfterFingerprintChangeReportsNewFingerprint() {
        long[] db = {4242L};
        ConfigSyncService syncService = new ConfigSyncService(() -> db[0]);
        ConfigSyncStatusPublisher publisher = new ConfigSyncStatusPublisher(
                redisManager, syncService, new MockEnvironment().withProperty("server.port", "9300"));

        db[0] = 999L;
        syncService.checkVersion();
        publisher.onConfigLoaded(event(3L));

        ArgumentCaptor<String> value = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(anyString(), value.capture(), any(Duration.class));
        assertTrue(value.getValue().contains("\"fingerprint\":\"999\""));
    }

    @Test
    void redisFailureIsSwallowed() {
        ConfigSyncService syncService = new ConfigSyncService(() -> 1L);
        ConfigSyncStatusPublisher publisher = new ConfigSyncStatusPublisher(
                redisManager, syncService, new MockEnvironment());
        doThrow(new RuntimeException("redis down"))
                .when(valueOperations).set(anyString(), anyString(), any(Duration.class));

        assertDoesNotThrow(() -> publisher.onConfigLoaded(event(1L)));
    }
}
