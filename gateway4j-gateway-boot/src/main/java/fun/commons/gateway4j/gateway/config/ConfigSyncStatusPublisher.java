package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;

import java.net.InetAddress;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Publishes this data-plane instance's config sync status into Redis after
 * every completed config reload (P1-3), so the admin console can answer
 * "is the gateway actually serving the latest config?" per instance.
 *
 * <p>Cross-agent contract (verbatim, do not rename): Redis key
 * {@code gateway4j:config:sync}, value = JSON
 * {@code {"version":N,"fingerprint":"...","updated_at":epoch_ms,"instance":"host:port"}},
 * TTL 120s. {@code version} = max config_version of the loaded snapshot;
 * {@code fingerprint} = the engine's content fingerprint (ConfigSyncService —
 * the same value the poll compares), stringified. The key self-expires, so a
 * dead instance's status disappears within 2 minutes; its absence means "no
 * heartbeat", not "in sync".</p>
 *
 * <p>Steady-state heartbeat: a live but fully idle instance (no config changes
 * at all) would otherwise age out of Redis after 2 quiet minutes and the admin
 * console would report "水位未知" for a perfectly healthy gateway. The scheduled
 * {@link #heartbeat()} re-publishes every 30s (same cadence as the engine's
 * config poll), keeping the 120s TTL strictly as a death detector. The
 * heartbeat reuses the last loaded snapshot's max config_version on purpose:
 * when the DB has newer changes the gateway has not polled yet, the stale
 * version correctly reads as "not in sync" on the admin side.</p>
 *
 * <p>Entirely fail-open: any Redis error is logged and swallowed; config
 * reload must never depend on this side channel.</p>
 */
public class ConfigSyncStatusPublisher {

    private static final Logger log = LoggerFactory.getLogger(ConfigSyncStatusPublisher.class);

    /** Cross-agent contract key (admin side reads it) — keep verbatim. */
    public static final String CONFIG_SYNC_KEY = "gateway4j:config:sync";

    /** Contract TTL: dead instances age out within 2 minutes. */
    static final long TTL_SECONDS = 120L;

    /** 稳态心跳周期：与 engine 配置轮询（30s）同频。 */
    static final long HEARTBEAT_INTERVAL_MS = 30_000L;

    /** ConfigLoadedEvent 未首发前无水位可续（心跳直接跳过）。 */
    private static final long NOT_LOADED = Long.MIN_VALUE;

    private final MultiRedisManager redisManager;
    private final ConfigSyncService configSyncService;
    private final String instanceId;

    /** 最近一次成功装载的快照 max(config_version)。 */
    private volatile long loadedMaxConfigVersion = NOT_LOADED;

    public ConfigSyncStatusPublisher(MultiRedisManager redisManager,
                                     ConfigSyncService configSyncService,
                                     Environment environment) {
        this.redisManager = redisManager;
        this.configSyncService = configSyncService;
        this.instanceId = resolveInstanceId(environment);
    }

    @EventListener
    public void onConfigLoaded(ConfigLoadedEvent event) {
        loadedMaxConfigVersion = event.getMaxConfigVersion();
        publish(event.getMaxConfigVersion(), false);
    }

    /** 稳态心跳：静默存活实例每 30s 续期水位，TTL 120s 退化为纯死亡检测。 */
    @Scheduled(fixedDelay = HEARTBEAT_INTERVAL_MS, initialDelay = HEARTBEAT_INTERVAL_MS)
    public void heartbeat() {
        long version = loadedMaxConfigVersion;
        if (version == NOT_LOADED) {
            return; // 尚未完成首次装载，无水位可续
        }
        publish(version, true);
    }

    private void publish(long version, boolean heartbeat) {
        try {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("version", version);
            status.put("fingerprint", String.valueOf(configSyncService.getLocalVersion()));
            status.put("updated_at", System.currentTimeMillis());
            status.put("instance", instanceId);
            redisManager.getStringRedisTemplate()
                    .opsForValue().set(CONFIG_SYNC_KEY, JsonUtils.toCompactJson(status),
                            Duration.ofSeconds(TTL_SECONDS));
            if (heartbeat) {
                // 30s 一次，info 会刷屏 —— 心跳走 debug
                log.debug("Config sync heartbeat renewed (key={}, version={}, instance={})",
                        CONFIG_SYNC_KEY, version, instanceId);
            } else {
                log.info("Config sync status published to Redis key {} (version={}, fingerprint={}, instance={})",
                        CONFIG_SYNC_KEY, version, configSyncService.getLocalVersion(), instanceId);
            }
        } catch (Exception e) {
            log.warn("Failed to publish config sync status to Redis (fail-open): {}", e.getMessage());
        }
    }

    /** Stable-ish instance identity for the dashboard: "hostname:server.port". */
    static String resolveInstanceId(Environment environment) {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "unknown-host";
        }
        String port = environment != null && environment.getProperty("server.port") != null
                ? environment.getProperty("server.port")
                : "9300";
        return host + ":" + port;
    }
}
