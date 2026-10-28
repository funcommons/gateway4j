package fun.commons.gateway4j.engine.config.sync;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConfigSyncServiceTest {

    private ConfigSyncService syncService;
    private long[] dbFingerprint = {0};

    @BeforeEach
    void setUp() {
        dbFingerprint[0] = 0;
        syncService = new ConfigSyncService(() -> dbFingerprint[0]);
    }

    @Test
    void noRefreshWhenFingerprintsMatch() {
        syncService.updateLocalVersion(5);
        dbFingerprint[0] = 5;
        assertFalse(syncService.checkVersion());
    }

    @Test
    void refreshWhenDbFingerprintChangesUpward() {
        syncService.updateLocalVersion(5);
        dbFingerprint[0] = 10;
        assertTrue(syncService.checkVersion());
        assertEquals(10, syncService.getLocalVersion());
    }

    /**
     * Regression for the P1-3 defect: a per-row config_version that moves DOWN or
     * stays below the previous global max must still trigger a reload. The
     * fingerprint semantics ("changed" instead of "strictly greater") covers the
     * new-route-first-publish case where the global max(config_version) never moved.
     */
    @Test
    void refreshWhenDbFingerprintChangesDownward() {
        syncService.updateLocalVersion(10);
        dbFingerprint[0] = 5;
        assertTrue(syncService.checkVersion());
        assertEquals(5, syncService.getLocalVersion());
    }

    @Test
    void noRefreshWhenDbFingerprintNull() {
        ConfigSyncService svc = new ConfigSyncService(() -> null);
        svc.updateLocalVersion(5);
        assertFalse(svc.checkVersion());
    }

    @Test
    void forceRefreshResetsVersion() {
        syncService.updateLocalVersion(10);
        syncService.forceRefresh();
        assertEquals(0, syncService.getLocalVersion());
    }
}
