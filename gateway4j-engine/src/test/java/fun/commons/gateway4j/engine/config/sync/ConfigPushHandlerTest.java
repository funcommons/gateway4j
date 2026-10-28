package fun.commons.gateway4j.engine.config.sync;

import fun.commons.gateway4j.engine.config.ConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class ConfigPushHandlerTest {

    private AtomicInteger reloads;
    private List<Long> fingerprints;
    private ConfigSyncService syncService;
    private ConfigPushHandler handler;

    @BeforeEach
    void setUp() {
        reloads = new AtomicInteger();
        fingerprints = new ArrayList<>();
        // ConfigSyncService over a controllable fingerprint supplier: checkVersion() is the debounce guard
        syncService = new ConfigSyncService(() -> fingerprints.isEmpty() ? 0L
                : fingerprints.get(fingerprints.size() - 1));
        ConfigService configService = new ConfigService(null, null, null, null,
                null, null, null, null, null) {
            @Override
            public void loadAllConfig() {
                reloads.incrementAndGet();
            }
        };
        handler = new ConfigPushHandler(configService, syncService);
    }

    @Test
    void pushTriggersReloadWhenFingerprintChanged() {
        fingerprints.add(42L); // DB moved ahead of local (0)

        handler.onMessage("gateway4j:config:changed",
                "{\"version\":1,\"operator\":\"admin\",\"changedType\":\"route\",\"at\":1}");

        assertEquals(1, reloads.get(), "a genuine push must trigger loadAllConfig");
    }

    @Test
    void duplicateOrStalePushIsDebouncedByFingerprint() {
        // fingerprint already synced (push raced / duplicated / commit not visible)
        syncService.updateLocalVersion(42L);
        fingerprints.add(42L);

        handler.onMessage("gateway4j:config:changed",
                "{\"version\":2,\"operator\":\"admin\",\"changedType\":\"plugin\",\"at\":2}");

        assertEquals(0, reloads.get(), "fingerprint-unchanged push must NOT reload (debounce/stale guard)");
    }

    @Test
    void malformedPayloadStillAppliesFingerprintGuard() {
        fingerprints.add(7L);

        handler.onMessage("gateway4j:config:changed", "not-json at all");

        assertEquals(1, reloads.get(), "payload is only a hint; the fingerprint guard decides");
    }

    @Test
    void reloadFailureIsSwallowedPollRemainsFallback() {
        fingerprints.add(9L);
        handler = new ConfigPushHandler(new ConfigService(null, null, null, null,
                null, null, null, null, null) {
            @Override
            public void loadAllConfig() {
                throw new IllegalStateException("db down");
            }
        }, new ConfigSyncService(() -> fingerprints.get(fingerprints.size() - 1)));

        assertDoesNotThrow(() -> handler.onMessage("gateway4j:config:changed",
                "{\"version\":3,\"operator\":\"op\",\"changedType\":\"global-plugin\",\"at\":3}"),
                "push handling must fail-open: the poll is the correctness fallback");
    }
}
