package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 60s fallback polling: compares the DB config fingerprint against the local
 * version and reloads all config when the DB moved ahead. With the Redis push
 * channel ({@code gateway4j:config:changed}) now providing second-level
 * propagation, polling is the correctness fallback only (missed push, Redis
 * down, commit-race) — hence the relaxed 60s default.
 */
@Component
public class ConfigPollingScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConfigPollingScheduler.class);

    private final ConfigSyncService configSyncService;
    private final ConfigService configService;

    public ConfigPollingScheduler(ConfigSyncService configSyncService, ConfigService configService) {
        this.configSyncService = configSyncService;
        this.configService = configService;
    }

    @Scheduled(fixedDelayString = "${gateway4j.config.poll-interval-ms:60000}", initialDelay = 30000)
    public void pollConfigVersion() {
        try {
            if (configSyncService.checkVersion()) {
                log.info("Config version advanced, reloading all config");
                configService.loadAllConfig();
            }
        } catch (Exception e) {
            log.warn("Config polling failed: {}", e.getMessage());
        }
    }
}
