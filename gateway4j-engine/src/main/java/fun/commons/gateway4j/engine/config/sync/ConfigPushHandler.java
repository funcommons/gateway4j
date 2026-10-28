package fun.commons.gateway4j.engine.config.sync;

import fun.commons.gateway4j.engine.config.ConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles an inbound "config changed" push (Redis pub/sub, channel
 * {@code gateway4j:config:changed}) by triggering the existing
 * {@link ConfigService#loadAllConfig()} reload.
 *
 * <p>Push semantics: admin publishes {@code {"version":N,"operator":"...",
 * "changedType":"route|plugin|global-plugin","at":epoch_ms}} after a config
 * change commits. The DB content fingerprint comparison in
 * {@link ConfigSyncService#checkVersion()} is deliberately KEPT as the
 * debounce / stale-message guard: a duplicate push, a push for a change that
 * is already loaded, or a push that races ahead of the DB commit is a no-op
 * (fingerprint unchanged), and a push whose commit is not yet visible simply
 * converges via the (slower) poll. The handler itself never trusts the payload
 * content — the DB stays the only source of truth.</p>
 *
 * <p>Any failure inside the handler is swallowed (fail-open): the periodic
 * poll remains the correctness fallback, a broken push channel may only add
 * latency, never downtime.</p>
 */
public class ConfigPushHandler {

    private static final Logger log = LoggerFactory.getLogger(ConfigPushHandler.class);

    private final ConfigService configService;
    private final ConfigSyncService configSyncService;

    public ConfigPushHandler(ConfigService configService, ConfigSyncService configSyncService) {
        this.configService = configService;
        this.configSyncService = configSyncService;
    }

    /**
     * @param channel pub/sub channel the message arrived on
     * @param payload raw message body, expected (not required to be)
     *                {@code {"version":N,"operator":"...","changedType":"...","at":epochMs}}
     */
    public void onMessage(String channel, String payload) {
        log.info("Config change push received: channel={}, payload={}", channel, payload);
        try {
            if (configSyncService.checkVersion()) {
                configService.loadAllConfig();
                log.info("Config change push applied, config reloaded");
            } else {
                log.info("Config change push ignored (fingerprint unchanged: duplicate/stale push or commit not yet visible), poll remains the fallback");
            }
        } catch (Exception e) {
            log.warn("Config change push handling failed, poll remains the fallback: {}", e.getMessage());
        }
    }
}
