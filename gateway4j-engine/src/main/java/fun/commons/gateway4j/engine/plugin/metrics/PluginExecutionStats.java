package fun.commons.gateway4j.engine.plugin.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLongArray;

/**
 * Per-plugin execution counters, recorded by {@code FailSafePluginChainRunner}
 * and the plugin-chain composition (PluginExecutionFilter) on the data plane.
 * Two consumers:
 *
 * <ul>
 *   <li>Micrometer meter {@link #METER_NAME} (Counter, tags {@code plugin} /
 *       {@code plugin_id} / {@code phase} / {@code result}) for Prometheus;</li>
 *   <li>{@code PluginRuntimeCatalogPublisher} (gateway-boot), which mirrors the
 *       cumulative {@code stats:{executed,skipped,error}} object into the Redis
 *       runtime catalog ({@code gateway4j:plugin:runtime}) for the admin UI.
 *       Counter values are cumulative since this JVM loaded its config.</li>
 * </ul>
 *
 * <p>Result semantics (cross-agent contract): {@code ok} = plugin executed and
 * its step completed without error; {@code skipped} = the plugin row had no
 * registered runtime instance (composition-time skip) or the instance's own
 * {@code skip(exchange)} returned true; {@code error} = the plugin threw and the
 * failure was handled by the chain (fail-open swallow or on_error=close
 * short-circuit).</p>
 *
 * <p>Entirely optional infrastructure: a {@code null} MeterRegistry disables
 * only the micrometer branch; the in-JVM counters always work (unit tests).</p>
 */
public class PluginExecutionStats {

    /** Meter name (cross-agent contract, verbatim). */
    public static final String METER_NAME = "gateway4j_plugin_execution";

    public enum Result {
        /** Plugin executed, step completed without error. */
        OK("ok"),
        /** Row unregistered (composition-time skip) or instance skip()==true. */
        SKIPPED("skipped"),
        /** Plugin threw; failure handled by the chain (fail-open or close). */
        ERROR("error");

        private final String tag;

        Result(String tag) {
            this.tag = tag;
        }

        /** Micrometer {@code result} tag value (lowercase). */
        public String tag() {
            return tag;
        }
    }

    /** slot indexes inside the AtomicLongArray: executed / skipped / error. */
    private static final int EXECUTED = 0;
    private static final int SKIPPED = 1;
    private static final int ERROR = 2;

    private final MeterRegistry meterRegistry;
    private final ConcurrentHashMap<String, AtomicLongArray> counters = new ConcurrentHashMap<>();

    public PluginExecutionStats() {
        this(null);
    }

    public PluginExecutionStats(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    /**
     * Records one plugin evaluation. All arguments are nullable-safe (nulls
     * degrade to {@code "unknown"} tags); never throws into the request path.
     */
    public void record(String pluginId, String pluginName, String phase, Result result) {
        try {
            String id = pluginId == null || pluginId.isBlank() ? "unknown" : pluginId;
            AtomicLongArray slot = counters.computeIfAbsent(id, k -> new AtomicLongArray(3));
            switch (result) {
                case OK -> slot.incrementAndGet(EXECUTED);
                case SKIPPED -> slot.incrementAndGet(SKIPPED);
                case ERROR -> slot.incrementAndGet(ERROR);
            }
            if (meterRegistry != null) {
                Counter.builder(METER_NAME)
                        .description("Gateway plugin executions by result")
                        .tag("plugin", pluginName == null || pluginName.isBlank() ? "unknown" : pluginName)
                        .tag("plugin_id", id)
                        .tag("phase", phase == null || phase.isBlank() ? "unknown" : phase)
                        .tag("result", result.tag())
                        .register(meterRegistry)
                        .increment();
            }
        } catch (Exception ignored) {
            // metrics must never break the request path (fail-open)
        }
    }

    /** Cumulative stats for one plugin_id: [executed, skipped, error]; zeros when unknown. */
    public long[] statsFor(String pluginId) {
        AtomicLongArray slot = pluginId == null ? null : counters.get(pluginId);
        return new long[]{
                slot == null ? 0L : slot.get(EXECUTED),
                slot == null ? 0L : slot.get(SKIPPED),
                slot == null ? 0L : slot.get(ERROR)
        };
    }

    /** Snapshot of all plugin_ids (plugin_id → {executed, skipped, error}). */
    public Map<String, long[]> snapshot() {
        Map<String, long[]> out = new LinkedHashMap<>();
        counters.forEach((k, v) -> out.put(k,
                new long[]{v.get(EXECUTED), v.get(SKIPPED), v.get(ERROR)}));
        return out;
    }
}
