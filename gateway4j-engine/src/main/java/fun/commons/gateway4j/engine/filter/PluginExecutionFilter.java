package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.plugin.chain.ConfiguredPlugin;
import fun.commons.gateway4j.engine.plugin.chain.FailSafePluginChainRunner;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Bridges the gateway plugin chain into the SCG filter chain:
 *
 * <pre>全局前置 → 路由前置 → [转发（SCG routing filter）] → 路由后置 → 全局后置</pre>
 *
 * <ul>
 *   <li>Global plugins: enabled GLOBAL rows from gw_plugin (scope GLOBAL, status
 *       ENABLED) ordered by sort_order.</li>
 *   <li>Route plugins: rows bound to the resolved route through
 *       gw_route_plugin_binding (route-bound plugins only run for the routes
 *       they are bound to), ordered by binding sort_order.</li>
 *   <li>Every plugin runs fail-open (see {@link FailSafePluginChainRunner}): a
 *       plugin error is logged and the chain continues.</li>
 * </ul>
 */
public class PluginExecutionFilter implements GlobalFilter, org.springframework.core.Ordered {

    private static final Logger log = LoggerFactory.getLogger(PluginExecutionFilter.class);

    /**
     * After {@link DispatchRoutingFilter} (so the serving route is already known
     * for dispatch flows) and well before the routing filter (Integer.MAX_VALUE),
     * which means PRE plugins run before the upstream call and POST plugins after
     * the response has been written.
     */
    public static final int PLUGIN_FILTER_ORDER = DispatchRoutingFilter.DISPATCH_FILTER_ORDER + 10;

    private static final String PHASE_PRE = "PRE";
    private static final String PHASE_POST = "POST";

    private final ConfigService configService;
    private final PluginInstanceRegistry pluginRegistry;

    public PluginExecutionFilter(ConfigService configService, PluginInstanceRegistry pluginRegistry) {
        this.configService = configService;
        this.pluginRegistry = pluginRegistry;
    }

    @Override
    public int getOrder() {
        return PLUGIN_FILTER_ORDER;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        exchange.getAttributes().putIfAbsent(GatewayConstants.REQUEST_START_TIME_KEY, System.nanoTime());
        Long routeId = resolveRouteId(exchange);

        List<GatewayPlugin> pre = compose(PHASE_PRE, routeId);
        List<GatewayPlugin> post = compose(PHASE_POST, routeId);
        if (log.isDebugEnabled() && (!pre.isEmpty() || !post.isEmpty())) {
            log.debug("Plugin chain for route {}: pre={}, post={}", routeId,
                    ids(pre), ids(post));
        }

        return new FailSafePluginChainRunner(pre).execute(exchange, Mono.empty())
                .then(Mono.defer(() -> {
                    if (exchange.getResponse().isCommitted()) {
                        // A PRE plugin short-circuited (already wrote the response):
                        // neither the forward nor the POST chain may run.
                        log.debug("Response committed by PRE plugin chain, skipping forward and POST chain");
                        return Mono.empty();
                    }
                    return chain.filter(exchange)
                            .then(Mono.defer(() -> new FailSafePluginChainRunner(post)
                                    .execute(exchange, Mono.empty())));
                }));
    }

    /**
     * Serving route id: set by DispatchRoutingFilter for dispatch flows (target
     * sub-route), otherwise the SCG-matched route id (BACKEND flow).
     */
    private Long resolveRouteId(ServerWebExchange exchange) {
        Object resolved = exchange.getAttribute(GatewayConstants.ROUTE_ID_KEY);
        if (resolved instanceof Long id) {
            return id;
        }
        org.springframework.cloud.gateway.route.Route scgRoute =
                exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        if (scgRoute == null) {
            return null;
        }
        try {
            return Long.valueOf(scgRoute.getId());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private List<GatewayPlugin> compose(String phase, Long routeId) {
        List<GatewayPlugin> composed = new ArrayList<>();
        if (PHASE_PRE.equals(phase)) {
            // 全局前置 → 路由前置
            appendInstances(composed, filterPhase(configService.getGlobalPlugins(phase), phase));
            if (routeId != null) {
                appendInstances(composed,
                        filterPhase(configService.getRouteBoundPluginRows(routeId), phase));
            }
        } else {
            // 路由后置 → 全局后置
            if (routeId != null) {
                appendInstances(composed,
                        filterPhase(configService.getRouteBoundPluginRows(routeId), phase));
            }
            appendInstances(composed, filterPhase(configService.getGlobalPlugins(phase), phase));
        }
        return composed;
    }

    private List<Plugin> filterPhase(List<Plugin> rows, String phase) {
        if (rows == null) {
            return List.of();
        }
        return rows.stream().filter(p -> phase.equals(p.getPluginPhase())).toList();
    }

    /** Maps persisted plugin rows to runtime instances; rows without an instance are skipped. */
    private void appendInstances(List<GatewayPlugin> target, List<Plugin> rows) {
        if (rows == null) {
            return;
        }
        for (Plugin row : rows) {
            GatewayPlugin instance = pluginRegistry.find(row.getPluginId());
            if (instance == null) {
                log.debug("Plugin row {} (plugin_id={}, type={}) has no runtime instance, skipping",
                        row.getId(), row.getPluginId(), row.getPluginType());
                continue;
            }
            int order = row.getSortOrder() != null ? row.getSortOrder() : 0;
            target.add(new ConfiguredPlugin(instance, order));
        }
    }

    private List<String> ids(List<GatewayPlugin> plugins) {
        return plugins.stream().map(GatewayPlugin::pluginId).filter(Objects::nonNull).toList();
    }
}
