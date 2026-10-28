package fun.commons.gateway4j.plugin.builtins.contextpath;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public class ContextPathPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(ContextPathPlugin.class);

    private volatile ContextPathPluginConfig config;

    public ContextPathPlugin() {
        super(BuiltinPluginConstants.CONTEXT_PATH, "上下文路径插件", "PRE", 30);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String path = exchange.getRequest().getURI().getRawPath();
        String modifiedPath = path;

        if (config.getStripPrefix() != null && config.getStripPrefix() > 0) {
            modifiedPath = stripPrefix(modifiedPath, config.getStripPrefix());
        }

        if (config.getAddPrefix() != null && !config.getAddPrefix().isEmpty()) {
            String prefix = config.getAddPrefix();
            if (!prefix.startsWith("/")) {
                prefix = "/" + prefix;
            }
            modifiedPath = prefix + modifiedPath;
        }

        if (config.getRewriteContextPath() != null && !config.getRewriteContextPath().isEmpty()) {
            String contextPath = config.getRewriteContextPath();
            if (!contextPath.startsWith("/")) {
                contextPath = "/" + contextPath;
            }
            if (!contextPath.endsWith("/")) {
                contextPath = contextPath + "/";
            }
            if (modifiedPath.startsWith(contextPath)) {
                modifiedPath = modifiedPath.substring(contextPath.length() - 1);
            }
        }

        if (modifiedPath.equals(path)) {
            return chain.execute(exchange);
        }

        if (!modifiedPath.startsWith("/")) {
            modifiedPath = "/" + modifiedPath;
        }

        String finalPath = modifiedPath;
        ServerWebExchange mutated = exchange.mutate().request(builder -> {
            builder.path(finalPath);
        }).build();

        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), ContextPathPluginConfig.class);
    }

    private String stripPrefix(String path, int count) {
        String normalized = path;
        while (normalized.startsWith("//")) {
            normalized = normalized.substring(1);
        }
        String[] segments = normalized.split("/");
        int toKeep = Math.min(count, segments.length - 1);
        StringBuilder sb = new StringBuilder();
        for (int i = toKeep + 1; i < segments.length; i++) {
            if (!segments[i].isEmpty()) {
                sb.append("/").append(segments[i]);
            }
        }
        return sb.length() == 0 ? "/" : sb.toString();
    }
}
