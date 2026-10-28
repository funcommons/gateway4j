package fun.commons.gateway4j.plugin.builtins.sentinel;

import com.alibaba.csp.sentinel.Entry;
import com.alibaba.csp.sentinel.SphU;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.alibaba.csp.sentinel.slots.block.degrade.DegradeRule;
import com.alibaba.csp.sentinel.slots.block.degrade.DegradeRuleManager;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRule;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRuleManager;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

public class SentinelPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(SentinelPlugin.class);

    private volatile SentinelPluginConfig config;

    public SentinelPlugin() {
        super(BuiltinPluginConstants.SENTINEL, "Sentinel熔断限流插件", "PRE", 4);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String resourceName = resolveResource(exchange);
        Entry entry = null;
        try {
            entry = SphU.entry(resourceName);
            return chain.execute(exchange);
        } catch (BlockException e) {
            log.warn("Sentinel blocked request for resource: {}, rule: {}", resourceName, e.getRule());
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            return exchange.getResponse().setComplete();
        } finally {
            if (entry != null) {
                entry.exit();
            }
        }
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), SentinelPluginConfig.class);
        loadRules();
    }

    @Override
    public void onDestroy() {
        FlowRuleManager.loadRules(new ArrayList<>());
        DegradeRuleManager.loadRules(new ArrayList<>());
    }

    private String resolveResource(ServerWebExchange exchange) {
        if (config != null && config.getResourceMode() != null) {
            return switch (config.getResourceMode()) {
                case "ROUTE" -> exchange.getRequest().getPath().value();
                case "IP" -> {
                    var addr = exchange.getRequest().getRemoteAddress();
                    yield addr != null ? addr.getAddress().getHostAddress() : "unknown";
                }
                default -> "gateway4j";
            };
        }
        return "gateway4j";
    }

    private void loadRules() {
        if (config == null) return;

        List<FlowRule> flowRules = new ArrayList<>();
        if (config.getFlowRules() != null) {
            for (SentinelFlowRule fr : config.getFlowRules()) {
                FlowRule rule = new FlowRule(fr.getResource() != null ? fr.getResource() : "gateway4j")
                        .setCount(fr.getCount())
                        .setGrade(fr.getGrade() != null ? fr.getGrade() : 1);
                if (fr.getLimitApp() != null) {
                    rule.setLimitApp(fr.getLimitApp());
                }
                flowRules.add(rule);
            }
        }
        FlowRuleManager.loadRules(flowRules);

        List<DegradeRule> degradeRules = new ArrayList<>();
        if (config.getDegradeRules() != null) {
            for (SentinelDegradeRule dr : config.getDegradeRules()) {
                DegradeRule rule = new DegradeRule(dr.getResource() != null ? dr.getResource() : "gateway4j")
                        .setGrade(dr.getGrade() != null ? dr.getGrade() : 0)
                        .setCount(dr.getCount())
                        .setTimeWindow(dr.getTimeWindow() != null ? dr.getTimeWindow().intValue() : 10);
                if (dr.getMinRequestAmount() != null) {
                    rule.setMinRequestAmount(dr.getMinRequestAmount());
                }
                if (dr.getStatIntervalMs() != null) {
                    rule.setStatIntervalMs(dr.getStatIntervalMs());
                }
                degradeRules.add(rule);
            }
        }
        DegradeRuleManager.loadRules(degradeRules);
    }
}
