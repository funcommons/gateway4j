package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.env.MockEnvironment;

import java.time.Duration;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * ConfigSyncStatusPublisher 单测（P1-3 稳态心跳补丁）：
 * reload 发布、TTL 120s 契约、首发事件前心跳跳过、静默存活续期、fail-open。
 */
class ConfigSyncStatusPublisherTest {

    private static final String KEY = ConfigSyncStatusPublisher.CONFIG_SYNC_KEY;

    private MultiRedisManager redisManager;
    private StringRedisTemplate template;
    private ValueOperations<String, String> valueOps;
    private ConfigSyncStatusPublisher publisher;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redisManager = mock(MultiRedisManager.class);
        template = mock(StringRedisTemplate.class);
        valueOps = mock(ValueOperations.class);
        org.mockito.Mockito.when(redisManager.getStringRedisTemplate()).thenReturn(template);
        org.mockito.Mockito.when(template.opsForValue()).thenReturn(valueOps);
        // getLocalVersion() 是内部字段（Supplier 仅供 checkVersion 比对用），先写入再断言
        ConfigSyncService syncService = new ConfigSyncService(() -> 4242L);
        syncService.updateLocalVersion(4242L);
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "9300");
        publisher = new ConfigSyncStatusPublisher(redisManager, syncService, env);
    }

    private ConfigLoadedEvent event(long maxVersion) {
        return new ConfigLoadedEvent(this, Collections.emptyList(), maxVersion);
    }

    @Test
    @DisplayName("reload 事件发布水位：version=快照 max(config_version)，TTL 120s")
    void reloadPublishesWatermarkWithContractTtl() {
        publisher.onConfigLoaded(event(7L));

        org.mockito.ArgumentCaptor<String> json = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(valueOps).set(eq(KEY), json.capture(), eq(Duration.ofSeconds(120)));
        assertThat(json.getValue())
                .contains("\"version\":7")
                .contains("\"fingerprint\":\"4242\"")
                .contains("\"instance\":")
                .contains("\"updated_at\":");
    }

    @Test
    @DisplayName("首次装载前心跳为 no-op（无水位可续）")
    void heartbeatBeforeFirstLoadIsNoop() {
        publisher.heartbeat();
        verifyNoInteractions(valueOps);
    }

    @Test
    @DisplayName("静默存活：心跳按最近装载版本续期水位（真实时钟单调）")
    void heartbeatRenewsAfterLoad() {
        publisher.onConfigLoaded(event(7L));
        publisher.heartbeat();

        org.mockito.ArgumentCaptor<String> json = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(valueOps, org.mockito.Mockito.times(2)).set(eq(KEY), json.capture(), eq(Duration.ofSeconds(120)));
        // 发布器走真实时钟：两次发布都带 updated_at，且心跳那一次 >= reload 那一次
        assertThat(json.getAllValues()).hasSize(2);
        assertThat(json.getAllValues().get(0)).contains("\"version\":7").contains("\"updated_at\":");
        assertThat(json.getAllValues().get(1)).contains("\"version\":7").contains("\"updated_at\":");
        long first = Long.parseLong(json.getAllValues().get(0).replaceAll(".*\"updated_at\":(\\d+).*", "$1"));
        long second = Long.parseLong(json.getAllValues().get(1).replaceAll(".*\"updated_at\":(\\d+).*", "$1"));
        assertThat(second).isGreaterThanOrEqualTo(first);
    }

    @Test
    @DisplayName("DB 有新版本但网关未轮询到：心跳仍报旧 version（admin 侧正确判未同步）")
    void heartbeatKeepsStaleVersionUntilReload() {
        publisher.onConfigLoaded(event(7L));
        // 模拟 DB 已到 v9：期间没有任何新 ConfigLoadedEvent，心跳只能续旧水位
        publisher.heartbeat();
        publisher.heartbeat();

        verify(valueOps, org.mockito.Mockito.times(3)).set(eq(KEY), org.mockito.ArgumentMatchers.contains("\"version\":7"), eq(Duration.ofSeconds(120)));
    }

    @Test
    @DisplayName("fail-open：Redis 异常不向 reload/心跳调用方传播")
    void redisFailureIsSwallowed() {
        doThrow(new RuntimeException("redis down")).when(valueOps).set(eq(KEY), anyString(), eq(Duration.ofSeconds(120)));

        assertThatCode(() -> publisher.onConfigLoaded(event(1L))).doesNotThrowAnyException();
        assertThatCode(() -> publisher.heartbeat()).doesNotThrowAnyException();
    }
}
