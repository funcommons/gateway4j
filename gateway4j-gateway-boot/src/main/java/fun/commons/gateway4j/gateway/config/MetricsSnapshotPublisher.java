package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.metrics.InFlightRequestTracker;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Publishes this JVM's route metrics into Redis so the admin console (a
 * separate JVM) can render the monitor dashboard.
 *
 * <p>Cross-JVM gap: MetricsPlugin increments meters on the data plane's
 * MeterRegistry (gateway-boot, port 9300), while admin's MonitorController
 * aggregates on its own JVM's registry (admin-boot, port 9301) — and traffic
 * only ever flows through 9300, so the dashboard read a permanent zero. This
 * publisher scans the local registry every 5s and mirrors per-path aggregates
 * into Redis for the admin side to merge into its sums.</p>
 *
 * <p>Cross-agent contract (verbatim, do not rename): Redis HASH key
 * {@code gateway4j:metrics:routes}, field = the meter {@code path} tag verbatim
 * (the same value MonitorController matches against normalizePath(route.getPath())),
 * value = compact JSON
 * {@code {"total":N,"errors":N,"latency_ms_sum":F,"latency_count":N,"active":N,"updated_at":epoch_ms}}
 * (total/errors/latency_count/active integers, latency_ms_sum fractional
 * millis). {@code active} is the in-flight request count for that path
 * (P1-1), read live from the {@link InFlightRequestTracker} — it is always
 * present (0 when no requests are in flight or no tracker is wired). Every
 * publish cycle ends with {@code EXPIRE 60}, so stale data self-expires within
 * 60s of the data plane dying.</p>
 *
 * <p>Meter selection mirrors MonitorController#sumByPath exactly: meter name
 * {@code endsWith} "requests.total" / "requests.errors" / "request.latency",
 * grouped by the {@code path} tag — so plugin rows with a custom
 * {@code metrics_prefix} are all swept in and same-path values from multiple
 * prefixes sum (correct semantics). Entirely fail-open: any Redis error is
 * rate-limited-logged and swallowed; the scheduled loop never exits and the
 * forwarding pipeline never depends on this side channel.</p>
 */
public class MetricsSnapshotPublisher {

    private static final Logger log = LoggerFactory.getLogger(MetricsSnapshotPublisher.class);

    /** Cross-agent contract key (admin side reads it) — keep verbatim. */
    public static final String METRICS_SNAPSHOT_KEY = "gateway4j:metrics:routes";

    /** Data-plane death → snapshot gone within this TTL. */
    static final long TTL_SECONDS = 60L;
    /** Redis failure WARN is rate-limited to one line per this window. */
    private static final long WARN_INTERVAL_MS = 60_000L;

    // Same endsWith matching as MonitorController.sumByPath (no leading dot on purpose).
    static final String TOTAL_SUFFIX = "requests.total";
    static final String ERRORS_SUFFIX = "requests.errors";
    static final String LATENCY_SUFFIX = "request.latency";

    private final MultiRedisManager redisManager;
    private final MeterRegistry meterRegistry;
    private final InFlightRequestTracker inFlightTracker;

    private volatile long lastWarnAtMs = 0L;

    public MetricsSnapshotPublisher(MultiRedisManager redisManager, MeterRegistry meterRegistry) {
        this(redisManager, meterRegistry, null);
    }

    public MetricsSnapshotPublisher(MultiRedisManager redisManager, MeterRegistry meterRegistry,
                                    InFlightRequestTracker inFlightTracker) {
        this.redisManager = redisManager;
        this.meterRegistry = meterRegistry;
        this.inFlightTracker = inFlightTracker;
    }

    /**
     * 5s cadence (tunable via {@code gateway4j.metrics.snapshot-interval-ms}):
     * local meters → per-path aggregates → Redis HASH + EXPIRE 60.
     */
    @Scheduled(fixedDelayString = "${gateway4j.metrics.snapshot-interval-ms:5000}", initialDelay = 10_000)
    public void publishSnapshot() {
        try {
            Map<String, String> snapshot = collectSnapshot(meterRegistry, System.currentTimeMillis());
            if (snapshot.isEmpty()) {
                // no local data (metrics plugin absent/disabled) → don't create the key;
                // any previous hash ages out via its own EXPIRE
                return;
            }
            StringRedisTemplate template = redisManager.getStringRedisTemplate();
            template.opsForHash().putAll(METRICS_SNAPSHOT_KEY, snapshot);
            template.expire(METRICS_SNAPSHOT_KEY, TTL_SECONDS, TimeUnit.SECONDS);
        } catch (Exception e) {
            warnRateLimited("Failed to publish metrics snapshot to Redis (fail-open): {}", e.getMessage());
        }
    }

    private void warnRateLimited(String format, Object arg) {
        long now = System.currentTimeMillis();
        long last = lastWarnAtMs;
        if (now - last >= WARN_INTERVAL_MS) {
            lastWarnAtMs = now;
            log.warn(format, arg);
        }
    }

    /**
     * Pure aggregator (unit-testable): scan the local registry, group by the
     * {@code path} tag — total/errors/latency_count sum as integers,
     * latency_ms_sum as (possibly fractional) millis; {@code active} is the
     * live in-flight count from the tracker (always emitted; 0 without one).
     */
    Map<String, String> collectSnapshot(MeterRegistry registry, long nowEpochMs) {
        // path → [total, errors, latency_count]
        Map<String, long[]> integers = new LinkedHashMap<>();
        Map<String, Double> latencyMsSum = new LinkedHashMap<>();
        for (Meter meter : registry.getMeters()) {
            String path = meter.getId().getTag("path");
            if (path == null) {
                continue;
            }
            String name = meter.getId().getName();
            if (name.endsWith(TOTAL_SUFFIX) && meter instanceof Counter counter) {
                integers.computeIfAbsent(path, p -> new long[3])[0] += (long) counter.count();
            } else if (name.endsWith(ERRORS_SUFFIX) && meter instanceof Counter counter) {
                integers.computeIfAbsent(path, p -> new long[3])[1] += (long) counter.count();
            } else if (name.endsWith(LATENCY_SUFFIX) && meter instanceof Timer timer) {
                integers.computeIfAbsent(path, p -> new long[3])[2] += timer.count();
                latencyMsSum.merge(path, timer.totalTime(TimeUnit.MILLISECONDS), Double::sum);
            }
        }
        Map<String, String> snapshot = new LinkedHashMap<>();
        for (Map.Entry<String, long[]> e : integers.entrySet()) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("total", e.getValue()[0]);
            value.put("errors", e.getValue()[1]);
            value.put("latency_ms_sum", latencyMsSum.getOrDefault(e.getKey(), 0d));
            value.put("latency_count", e.getValue()[2]);
            value.put("active", inFlightTracker == null ? 0L : inFlightTracker.activeFor(e.getKey()));
            value.put("updated_at", nowEpochMs);
            snapshot.put(e.getKey(), JsonUtils.toCompactJson(value));
        }
        return snapshot;
    }
}
