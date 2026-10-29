package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Wrapper installed on every dynamic plugin instance (GROOVY / JAR) by
 * {@link DynamicPluginLoader}. Two jobs:
 *
 * <ul>
 *   <li><b>Row-bound identity</b>: {@code pluginId()} is forced to the
 *       {@code gw_plugin.plugin_id} of the row that loaded the instance, so a
 *       script/jar returning a different id still registers under (and composes
 *       with) the row that owns it.</li>
 *   <li><b>Execution timeout</b> (ADR-003 phase 1 guard): the instance's returned
 *       {@link Mono} is bound with {@code timeout(execTimeoutMs, default 1000)}. On
 *       timeout the wrapper emits {@link java.util.concurrent.TimeoutException} —
 *       the plugin just "throws" and the EXISTING chain semantics take over
 *       (fail-open continue, or 503 short-circuit when the row's config sets
 *       {@code on_error=close}; FailSafePluginChainRunner records the error).</li>
 * </ul>
 *
 * <p>Known limitation (deliberate, phase 1): the timeout covers the plugin's whole
 * returned pipeline, INCLUDING its delegation via {@code chain.execute(...)} — a
 * slow upstream inside a delegating script plugin can trip the timeout. Scripts
 * that block the calling thread in an infinite loop cannot be interrupted by a
 * reactive operator at all (JVM limitation); such scripts need a dedicated watchdog
 * thread, deferred to phase 2.</p>
 */
public class TimeoutGuardedPlugin implements GatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(TimeoutGuardedPlugin.class);

    private final GatewayPlugin delegate;
    private final String rowPluginId;
    private final Duration timeout;

    public TimeoutGuardedPlugin(GatewayPlugin delegate, String rowPluginId, Duration timeout) {
        this.delegate = delegate;
        this.rowPluginId = rowPluginId;
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative()
                ? Duration.ofMillis(1000)
                : timeout;
    }

    @Override
    public String pluginId() {
        // forced to the OWNING row's id — registry/composition key
        return rowPluginId;
    }

    @Override
    public String pluginName() {
        return delegate.pluginName();
    }

    @Override
    public String phase() {
        return delegate.phase();
    }

    @Override
    public int order() {
        return delegate.order();
    }

    @Override
    public boolean skip(ServerWebExchange exchange) {
        return delegate.skip(exchange);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        return delegate.execute(exchange, chain)
                .timeout(timeout)
                .onErrorMap(java.util.concurrent.TimeoutException.class, t -> {
                    log.warn("Dynamic plugin {} timed out after {}ms (fail via chain policy)",
                            rowPluginId, timeout.toMillis());
                    // the plugin "threw" — the chain runner applies on_error semantics
                    return new IllegalStateException(
                            "Dynamic plugin '" + rowPluginId + "' timed out after "
                                    + timeout.toMillis() + "ms", t);
                });
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        delegate.onConfigChange(config);
    }

    @Override
    public void onDestroy() {
        delegate.onDestroy();
    }

    @Override
    public String configSchema() {
        return delegate.configSchema();
    }
}
