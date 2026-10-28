package fun.commons.gateway4j.plugin.builtins.request;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

public class RequestPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(RequestPlugin.class);

    private volatile RequestPluginConfig config;

    public RequestPlugin() {
        super(BuiltinPluginConstants.REQUEST, "请求修改插件", "PRE", 21);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        boolean hasOps = (config.getAddHeaders() != null && !config.getAddHeaders().isEmpty())
                || (config.getReplaceHeaders() != null && !config.getReplaceHeaders().isEmpty())
                || (config.getRemoveHeaders() != null && !config.getRemoveHeaders().isEmpty())
                || (config.getAddQueryParams() != null && !config.getAddQueryParams().isEmpty())
                || (config.getRemoveQueryParams() != null && !config.getRemoveQueryParams().isEmpty())
                || (config.getAddCookies() != null && !config.getAddCookies().isEmpty())
                || (config.getRemoveCookies() != null && !config.getRemoveCookies().isEmpty());

        if (!hasOps) {
            return chain.execute(exchange);
        }

        ServerWebExchange mutated = applyModifications(exchange);
        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), RequestPluginConfig.class);
    }

    private ServerWebExchange applyModifications(ServerWebExchange exchange) {
        var requestBuilder = exchange.getRequest().mutate();

        if (config.getAddHeaders() != null) {
            for (Map.Entry<String, String> entry : config.getAddHeaders().entrySet()) {
                requestBuilder.header(entry.getKey(), entry.getValue());
            }
        }
        if (config.getReplaceHeaders() != null) {
            for (Map.Entry<String, String> entry : config.getReplaceHeaders().entrySet()) {
                requestBuilder.headers(headers -> headers.set(entry.getKey(), entry.getValue()));
            }
        }
        if (config.getRemoveHeaders() != null) {
            requestBuilder.headers(headers -> {
                for (String key : config.getRemoveHeaders()) {
                    headers.remove(key);
                }
            });
        }

        if (config.getAddCookies() != null) {
            for (Map.Entry<String, String> entry : config.getAddCookies().entrySet()) {
                requestBuilder.header("Cookie", entry.getKey() + "=" + entry.getValue());
            }
        }
        if (config.getRemoveCookies() != null) {
            requestBuilder.headers(headers -> {
                String cookieHeader = headers.getFirst("Cookie");
                if (cookieHeader != null) {
                    StringBuilder filtered = new StringBuilder();
                    for (String part : cookieHeader.split(";")) {
                        String trimmed = part.trim();
                        String cookieName = trimmed.split("=", 2)[0].trim();
                        if (!config.getRemoveCookies().contains(cookieName)) {
                            if (filtered.length() > 0) filtered.append("; ");
                            filtered.append(trimmed);
                        }
                    }
                    headers.set("Cookie", filtered.toString());
                }
            });
        }

        if ((config.getAddQueryParams() != null && !config.getAddQueryParams().isEmpty())
                || (config.getRemoveQueryParams() != null && !config.getRemoveQueryParams().isEmpty())) {
            String uri = exchange.getRequest().getURI().toString();
            String modifiedUri = modifyQueryString(uri);
            requestBuilder.uri(java.net.URI.create(modifiedUri));
        }

        return exchange.mutate().request(requestBuilder.build()).build();
    }

    private String modifyQueryString(String uri) {
        int queryStart = uri.indexOf('?');
        String baseUri = queryStart >= 0 ? uri.substring(0, queryStart) : uri;
        String queryString = queryStart >= 0 ? uri.substring(queryStart + 1) : "";

        StringBuilder newQuery = new StringBuilder();
        if (!queryString.isEmpty()) {
            for (String param : queryString.split("&")) {
                String[] kv = param.split("=", 2);
                if (config.getRemoveQueryParams() != null && config.getRemoveQueryParams().contains(kv[0])) {
                    continue;
                }
                if (newQuery.length() > 0) newQuery.append("&");
                newQuery.append(param);
            }
        }

        if (config.getAddQueryParams() != null) {
            for (Map.Entry<String, String> entry : config.getAddQueryParams().entrySet()) {
                if (newQuery.length() > 0) newQuery.append("&");
                newQuery.append(java.net.URLEncoder.encode(entry.getKey(), java.nio.charset.StandardCharsets.UTF_8))
                        .append("=")
                        .append(java.net.URLEncoder.encode(entry.getValue(), java.nio.charset.StandardCharsets.UTF_8));
            }
        }

        return newQuery.length() > 0 ? baseUri + "?" + newQuery : baseUri;
    }
}
