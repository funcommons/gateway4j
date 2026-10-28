package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

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
 */
public class FailSafePluginChainRunner {

    private static final Logger log = LoggerFactory.getLogger(FailSafePluginChainRunner.class);

    /** Exchange attribute: set when the terminal continuation was first subscribed. */
    public static final String CONTINUATION_STARTED_ATTR =
            GatewayConstants.PLUGIN_CONTEXT_PREFIX + "chainContinuationStarted";

    private final List<GatewayPlugin> plugins;

    public FailSafePluginChainRunner(List<GatewayPlugin> plugins) {
        this.plugins = plugins == null ? List.of() : List.copyOf(plugins);
    }

    /**
     * @param continuation executed after the last plugin (e.g. the SCG filter chain);
     *                     pass {@link Mono#empty()} for observe-only chains (POST phase).
     */
    public Mono<Void> execute(ServerWebExchange exchange, Mono<Void> continuation) {
        Mono<Void> base = continuation == null ? Mono.<Void>empty() : continuation;
        Mono<Void> guarded = base
                .doOnSubscribe(s -> exchange.getAttributes().put(CONTINUATION_STARTED_ATTR, Boolean.TRUE));
        return executeFrom(0, exchange, guarded);
    }

    private Mono<Void> executeFrom(int index, ServerWebExchange exchange, Mono<Void> continuation) {
        if (index >= plugins.size()) {
            return continuation;
        }
        GatewayPlugin plugin = plugins.get(index);

        Mono<Void> step;
        try {
            if (plugin.skip(exchange)) {
                step = executeFrom(index + 1, exchange, continuation);
            } else {
                step = plugin.execute(exchange, new RemainingChain(index + 1, continuation));
            }
        } catch (Throwable t) {
            log.warn("Plugin {} threw synchronously, fail-open continue: {}",
                    plugin.pluginId(), t.toString());
            step = executeFrom(index + 1, exchange, continuation);
        }

        return step.onErrorResume(t -> {
            if (Boolean.TRUE.equals(exchange.getAttribute(CONTINUATION_STARTED_ATTR))) {
                // The forwarding (or a later plugin) already ran; never re-run the chain.
                log.warn("Plugin {} failed after chain progressed, propagating: {}",
                        plugin.pluginId(), t.toString());
                return Mono.error(t);
            }
            log.warn("Plugin {} failed, fail-open continue: {}", plugin.pluginId(), t.toString());
            return executeFrom(index + 1, exchange, continuation);
        });
    }

    /** PluginChain view over the plugins after {@code index}. */
    private final class RemainingChain implements PluginChain {

        private final int index;
        private final Mono<Void> continuation;

        private RemainingChain(int index, Mono<Void> continuation) {
            this.index = index;
            this.continuation = continuation;
        }

        @Override
        public Mono<Void> execute(ServerWebExchange chainExchange) {
            return executeFrom(index, chainExchange, continuation);
        }
    }
}
