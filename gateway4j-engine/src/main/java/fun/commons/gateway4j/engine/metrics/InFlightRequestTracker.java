package fun.commons.gateway4j.engine.metrics;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

/**
 * Tracks in-flight (currently executing) request counts per route path pattern
 * bucket, so {@code MetricsSnapshotPublisher} can extend the Redis metrics
 * snapshot with an {@code active} field (P1-1 active_connections gauge).
 *
 * <p>Buckets are keyed by the serving route's configured path pattern (the
 * {@code gw4j:routePathPattern} exchange attribute set by PluginExecutionFilter).
 * Requests where no pattern can be resolved (route row missing/unreadable) are
 * counted into the single {@link #OTHER_BUCKET} ({@code "_other"}) bucket — they
 * are counted, but the snapshot publisher cannot attribute them to any concrete
 * path field, so their per-path {@code active} reads 0 (total/errors/latency are
 * unaffected).</p>
 *
 * <p>DISPATCH routes: PluginExecutionFilter resolves the TARGET sub-route before
 * exposing the pattern, so a dispatch request is accounted under its target
 * sub-route's pattern (not the dispatch route's).</p>
 *
 * <p>Unmatched requests (no SCG route) never enter the gateway filter chain at
 * all and are therefore not counted — they fail fast with 404 before any
 * GlobalFilter runs.</p>
 *
 * <p>The map is bounded: keys are route path patterns (bounded by the route
 * table size) plus the fixed {@code "_other"} bucket; entries that drop to zero
 * stay (bounded, avoids churn) and are simply published as 0.</p>
 */
public class InFlightRequestTracker {

    /** Catch-all bucket for requests whose route path pattern cannot be resolved. */
    public static final String OTHER_BUCKET = "_other";

    private final ConcurrentHashMap<String, LongAdder> inFlight = new ConcurrentHashMap<>();

    /**
     * Bucket key for a request: the normalized route path pattern when present,
     * else {@link #OTHER_BUCKET}.
     *
     * <p>Normalization MUST stay in sync with MetricsPlugin#normalizePath
     * (gateway4j-plugin-builtins): the snapshot's {@code path} field is that
     * plugin's meter tag, and the {@code active} lookup below only hits when
     * both sides normalize identically. Duplicated on purpose — plugin-api /
     * engine cannot carry the shared helper without widening the dependency
     * surface (same tradeoff as the "gw4j:routePathPattern" literal).</p>
     */
    public String bucketFor(String routePathPattern) {
        if (routePathPattern == null || routePathPattern.isBlank()) {
            return OTHER_BUCKET;
        }
        return normalize(routePathPattern);
    }

    public void increment(String bucket) {
        inFlight.computeIfAbsent(bucket, k -> new LongAdder()).increment();
    }

    public void decrement(String bucket) {
        LongAdder adder = inFlight.get(bucket);
        if (adder != null && adder.sum() > 0) {
            adder.decrement();
        }
    }

    /** Current in-flight count for one bucket (0 when the bucket is unknown). */
    public long activeFor(String bucket) {
        LongAdder adder = bucket == null ? null : inFlight.get(bucket);
        return adder == null ? 0L : adder.sum();
    }

    /** Snapshot of all buckets (bucket → count, including zeros once touched). */
    public Map<String, Long> snapshot() {
        Map<String, Long> out = new LinkedHashMap<>();
        inFlight.forEach((k, v) -> out.put(k, v.sum()));
        return out;
    }

    /**
     * Same normalization as MetricsPlugin#normalizePath — keep in sync.
     */
    private static String normalize(String path) {
        String normalized = path.replaceAll("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{id}");
        normalized = normalized.replaceAll("/\\d+", "/{id}");
        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
        }
        return normalized;
    }
}
