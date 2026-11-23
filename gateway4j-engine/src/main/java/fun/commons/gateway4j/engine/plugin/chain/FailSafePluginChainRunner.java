package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats;
import fun.commons.gateway4j.engine.web.GatewayErrorResponses;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.function.Function;

/**
 * Executes a plugin list in order with per-plugin fail-open semantics:
 * a plugin that throws (synchronously or asynchronously) is logged and the
 * chain continues with the next plugin, so a broken plugin can never take the
 * whole gateway down.
 *
 * <p>Guard rail: once the terminal continuation (the actual forwarding) has
 * been subscribed, errors are no longer converted into "continue with next
 * plugin" — they propagate. Otherwise a plugin that delegated downstream and
 * saw the forward fail would trigger a second forward attempt through its
 * error handler.</p>
 *
 * <p>on_error policy (P1-2): a plugin whose {@code gw_plugin.config} JSON sets
 * {@code "on_error":"close"} (see {@link ConfiguredPlugin#extractOnError})
 * short-circuits the request with 503 + JSON envelope when it throws — before
 * the continuation has started. After the continuation started the guard rail
 * above wins (the error propagates; a rendered response can't be un-rendered).
 * Every plugin (default open) keeps the historical fail-open behavior.</p>
 *
 * <p>Execution metrics (P1-2): every evaluation is recorded into the optional
 * {@link PluginExecutionStats} — {@code ok} / {@code skipped} / {@code error} —
 * feeding the {@code gateway4j_plugin_execution} meter and the Redis runtime
 * catalog's {@code stats} object.</p>
 *
 * <p>Exchange propagation (S11-4d): within the chain every plugin already
 * receives whatever its predecessor handed downstream (a plugin may call
 * {@code chain.execute(mutated)}). {@link #executeFn(ServerWebExchange, Function)}
 * extends that propagation past the chain boundary: the terminal continuation
 * is invoked with the chain's final exchange, so caller-side steps that run
 * after the chain (the SCG forward, path rewrite) observe the mutated view
 * (e.g. a PRE response decorator) instead of the stale original. The legacy
 * {@link #execute(ServerWebExchange, Mono)} keeps its fixed-Mono continuation
 * for observe-only chains.</p>
 */
public class FailSafePluginChainRunner {

    private static final Logger log = LoggerFactory.getLogger(FailSafePluginChainRunner.class);

    /** Exchange attribute: set when the terminal continuation was first subscribed. */
    public static final String CONTINUATION_STARTED_ATTR =
            GatewayConstants.PLUGIN_CONTEXT_PREFIX + "chainContinuationStarted";

    /** Exchange attribute: set when an on_error=close plugin short-circuited the request (value = plugin_id). */
    public static final String ABORTED_BY_PLUGIN_ATTR =
            GatewayConstants.PLUGIN_CONTEXT_PREFIX + "chainAbortedByPlugin";

    private final List<GatewayPlugin> plugins;
    private final PluginExecutionStats stats;

    public FailSafePluginChainRunner(List<GatewayPlugin> plugins) {
        this(plugins, null);
    }

    public FailSafePluginChainRunner(List<GatewayPlugin> plugins, PluginExecutionStats stats) {
        this.plugins = plugins == null ? List.of() : List.copyOf(plugins);
        this.stats = stats;
    }

    /**
     * Legacy entry point: the terminal continuation is a fixed {@link Mono},
     * which is blind to any exchange mutation a plugin performed on the way
     * through the chain. Delegates to {@link #executeFn(ServerWebExchange,
     * Function)} discarding the chain's final exchange — the right choice for
     * observe-only chains (POST phase) and for continuations that don't depend
     * on the mutated view.
     *
     * @param continuation executed after the last plugin (e.g. the SCG filter chain);
     *                     pass {@link Mono#empty()} for observe-only chains (POST phase).
     */
    public Mono<Void> execute(ServerWebExchange exchange, Mono<Void> continuation) {
        Mono<Void> base = continuation == null ? Mono.<Void>empty() : continuation;
        return executeFn(exchange, ignored -> base);
    }

    /**
     * S11-4d: like {@link #execute(ServerWebExchange, Mono)} but the terminal
     * continuation receives the chain's <em>final</em> exchange — the one the
     * last executed plugin handed downstream. A PRE plugin may mutate the
     * exchange (e.g. wrap the response in a decorator for watermark injection);
     * with the legacy API that mutation died at this runner's boundary because
     * the caller kept forwarding the ORIGINAL exchange reference. Here the
     * mutated exchange flows out of the chain, so the caller can forward it.
     *
     * <p>The continuation guard rail (continuation-started marker, see
     * {@code onErrorResume} below) is unchanged: the marker lands on the entry
     * exchange's attribute map, which mutated (decorated) exchanges share by
     * delegation.</p>
     *
     * @param continuation function executed after the last plugin; receives the
     *                     final chain exchange. The continuation Mono is only
     *                     subscribed if the chain reached the end (every plugin
     *                     delegated) — a short-circuiting plugin that never
     *                     delegates skips it by construction.
     */
    public Mono<Void> executeFn(ServerWebExchange exchange,
                                Function<ServerWebExchange, Mono<Void>> continuation) {
        Function<ServerWebExchange, Mono<Void>> guarded = ex -> continuation.apply(ex)
                .doOnSubscribe(s -> exchange.getAttributes().put(CONTINUATION_STARTED_ATTR, Boolean.TRUE));
        return executeFrom(0, exchange, guarded);
    }

    private Mono<Void> executeFrom(int index, ServerWebExchange exchange,
                                   Function<ServerWebExchange, Mono<Void>> continuation) {
        if (index >= plugins.size()) {
            // End of the chain: hand the continuation the exchange this level
            // received — the final (possibly plugin-mutated) view.
            return continuation.apply(exchange);
        }
        GatewayPlugin plugin = plugins.get(index);

        Mono<Void> step;
        try {
            if (plugin.skip(exchange)) {
                record(plugin, PluginExecutionStats.Result.SKIPPED);
                step = executeFrom(index + 1, exchange, continuation);
            } else {
                step = plugin.execute(exchange, new RemainingChain(index + 1, continuation))
                        .doOnSuccess(v -> record(plugin, PluginExecutionStats.Result.OK));
            }
        } catch (Throwable t) {
            record(plugin, PluginExecutionStats.Result.ERROR);
            log.warn("Plugin {} threw synchronously, fail-open continue: {}",
                    plugin.pluginId(), t.toString());
            if (closeOnError(plugin)) {
                return shortCircuit(exchange, plugin, t);
            }
            step = executeFrom(index + 1, exchange, continuation);
        }

        return step.onErrorResume(t -> {
            if (Boolean.TRUE.equals(exchange.getAttribute(CONTINUATION_STARTED_ATTR))) {
                // The forwarding (or a later plugin) already ran; never re-run the chain.
                // NOTE: deliberately NOT recorded as this plugin's ERROR — the failure
                // belongs to the forward (tracked by the request metrics), and the error
                // re-emitted from a deeper level would otherwise be attributed to every
                // outer plugin boundary it passes through.
                log.warn("Plugin {} failed after chain progressed, propagating: {}",
                        plugin.pluginId(), t.toString());
                return Mono.error(t);
            }
            record(plugin, PluginExecutionStats.Result.ERROR);
            log.warn("Plugin {} failed, fail-open continue: {}", plugin.pluginId(), t.toString());
            if (closeOnError(plugin)) {
                return shortCircuit(exchange, plugin, t);
            }
            return executeFrom(index + 1, exchange, continuation);
        });
    }

    /** on_error=close (from the row's config JSON) → 503 short-circuit instead of fail-open. */
    private boolean closeOnError(GatewayPlugin plugin) {
        return plugin instanceof ConfiguredPlugin configured
                && ConfiguredPlugin.ON_ERROR_CLOSE.equals(configured.onError());
    }

    /**
     * Renders 503 + JSON envelope and terminates the chain (no further plugins,
     * no forward). The written response commits it, which PluginExecutionFilter's
     * existing isCommitted guard turns into "skip forward and POST chain".
     * Fail-safe: an already-committed response can't be rewritten — the original
     * error propagates instead.
     */
    private Mono<Void> shortCircuit(ServerWebExchange exchange, GatewayPlugin plugin, Throwable t) {
        log.warn("Plugin {} failed with on_error=close, short-circuiting request with 503: {}",
                plugin.pluginId(), t.toString());
        exchange.getAttributes().put(ABORTED_BY_PLUGIN_ATTR, String.valueOf(plugin.pluginId()));
        if (exchange.getResponse().isCommitted()) {
            return Mono.error(t);
        }
        return GatewayErrorResponses.respond(exchange, HttpStatus.SERVICE_UNAVAILABLE,
                "Service Unavailable: plugin '" + plugin.pluginId() + "' failed (on_error=close)");
    }

    private void record(GatewayPlugin plugin, PluginExecutionStats.Result result) {
        if (stats != null) {
            stats.record(plugin.pluginId(), plugin.pluginName(), plugin.phase(), result);
        }
    }

    /** PluginChain view over the plugins after {@code index}. */
    private final class RemainingChain implements PluginChain {

        private final int index;
        private final Function<ServerWebExchange, Mono<Void>> continuation;

        private RemainingChain(int index, Function<ServerWebExchange, Mono<Void>> continuation) {
            this.index = index;
            this.continuation = continuation;
        }

        @Override
        public Mono<Void> execute(ServerWebExchange chainExchange) {
            return executeFrom(index, chainExchange, continuation);
        }
    }
}
