package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

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
 * TTL 120s. {@code version} = max config_version of the just-loaded snapshot;
 * {@code fingerprint} = the engine's content fingerprint (ConfigSyncService —
 * the same value the poll compares), stringified. The key self-expires, so a
 * dead instance's status disappears within 2 minutes; its absence means "no
 * heartbeat", not "in sync".</p>
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

    private final MultiRedisManager redisManager;
    private final ConfigSyncService configSyncService;
    private final String instanceId;

    public ConfigSyncStatusPublisher(MultiRedisManager redisManager,
                                     ConfigSyncService configSyncService,
                                     Environment environment) {
        this.redisManager = redisManager;
        this.configSyncService = configSyncService;
        this.instanceId = resolveInstanceId(environment);
    }

    @EventListener
    public void onConfigLoaded(ConfigLoadedEvent event) {
        try {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("version", event.getMaxConfigVersion());
            status.put("fingerprint", String.valueOf(configSyncService.getLocalVersion()));
            status.put("updated_at", System.currentTimeMillis());
            status.put("instance", instanceId);
            redisManager.getStringRedisTemplate()
                    .opsForValue().set(CONFIG_SYNC_KEY, JsonUtils.toCompactJson(status),
                            Duration.ofSeconds(TTL_SECONDS));
            log.info("Config sync status published to Redis key {} (version={}, fingerprint={}, instance={})",
                    CONFIG_SYNC_KEY, event.getMaxConfigVersion(), configSyncService.getLocalVersion(), instanceId);
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
