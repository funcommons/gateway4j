package fun.commons.gateway4j.engine.config.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Supplier;

/**
 * Decides when the engine should reload configuration from the DB.
 *
 * <p>Historical defect: the supplier delivered {@code max(config_version)} and a
 * reload only fired when the DB max was strictly greater than the local value.
 * Because config_version increments per row (publish/offline +1 on that row), a
 * brand-new route's first publish (v1) could stay below an existing global max —
 * the global max never moved and the reload never fired: "published but the
 * gateway never picks it up, silently".</p>
 *
 * <p>Fix: the supplier now delivers a <b>content fingerprint</b> of the whole
 * config set — a stable fold over every gw_route / gw_plugin row of
 * (id, status, config_version, updated_at). Any insert, publish/offline
 * (version bump), row update (updated_at trigger) or delete changes the
 * fingerprint, so every change is picked up by the 30s poll within one cycle,
 * regardless of per-row version numbers. Per-row config_version semantics are
 * untouched, which keeps the admin side unchanged.</p>
 */
public class ConfigSyncService {

    private static final Logger log = LoggerFactory.getLogger(ConfigSyncService.class);

    private final Supplier<Long> configFingerprintSupplier;
    private volatile long localFingerprint = 0;

    public ConfigSyncService(Supplier<Long> configFingerprintSupplier) {
        this.configFingerprintSupplier = configFingerprintSupplier;
    }

    public boolean checkVersion() {
        Long fingerprint = configFingerprintSupplier.get();
        if (fingerprint == null) {
            return false;
        }
        if (fingerprint != localFingerprint) {
            log.info("Config fingerprint changed: local={}, db={}, triggering refresh",
                    localFingerprint, fingerprint);
            localFingerprint = fingerprint;
            return true;
        }
        return false;
    }

    public void updateLocalVersion(long version) {
        this.localFingerprint = version;
    }

    public long getLocalVersion() {
        return localFingerprint;
    }

    public void forceRefresh() {
        localFingerprint = 0;
    }
}
