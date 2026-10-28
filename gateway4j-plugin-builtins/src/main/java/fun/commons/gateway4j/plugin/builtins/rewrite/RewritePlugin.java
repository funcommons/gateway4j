package fun.commons.gateway4j.plugin.builtins.rewrite;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

public class RewritePlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(RewritePlugin.class);

    private volatile RewritePluginConfig config;
    private volatile Pattern compiledPattern;

    public RewritePlugin() {
        super(BuiltinPluginConstants.REWRITE, "路径重写插件", "PRE", 20);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        if (compiledPattern == null || config.getReplace() == null || config.getReplace().isEmpty()) {
            return chain.execute(exchange);
        }

        int percentage = config.getPercentage() != null
                ? Math.max(0, Math.min(100, config.getPercentage()))
                : 100;
        if (percentage < 100 && ThreadLocalRandom.current().nextInt(100) >= percentage) {
            return chain.execute(exchange);
        }

        String path = exchange.getRequest().getURI().getRawPath();
        String rewritten = compiledPattern.matcher(path).replaceAll(config.getReplace());

        if (!rewritten.equals(path)) {
            log.debug("Rewriting path: {} -> {}", path, rewritten);
            exchange.getAttributes().put(GatewayConstants.PLUGIN_CONTEXT_PREFIX + "rewrite_uri", rewritten);
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        RewritePluginConfig newConfig = JsonUtils.parseObject(config.config(), RewritePluginConfig.class);
        if (newConfig.getRegex() != null && !newConfig.getRegex().isEmpty()) {
            try {
                this.compiledPattern = Pattern.compile(newConfig.getRegex());
            } catch (PatternSyntaxException e) {
                log.warn("Invalid rewrite regex pattern '{}': {}", newConfig.getRegex(), e.getMessage());
                return;
            }
        } else {
            this.compiledPattern = null;
        }
        this.config = newConfig;
    }
}
