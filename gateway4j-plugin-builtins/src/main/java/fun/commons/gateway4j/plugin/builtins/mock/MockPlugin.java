package fun.commons.gateway4j.plugin.builtins.mock;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Map;

public class MockPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(MockPlugin.class);

    private volatile MockPluginConfig config;

    public MockPlugin() {
        super(BuiltinPluginConstants.MOCK, "Mock插件", "PRE", 0);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getResponseContent() == null) {
            return chain.execute(exchange);
        }

        int statusCode = config.getStatusCode() != null ? config.getStatusCode() : 200;
        try {
            exchange.getResponse().setStatusCode(HttpStatus.valueOf(statusCode));
        } catch (IllegalArgumentException e) {
            log.warn("Mock plugin invalid status code: {}, defaulting to 200", statusCode);
            exchange.getResponse().setStatusCode(HttpStatus.OK);
        }

        HttpHeaders headers = exchange.getResponse().getHeaders();
        if (config.getResponseHeaders() != null) {
            for (Map.Entry<String, String> entry : config.getResponseHeaders().entrySet()) {
                headers.add(entry.getKey(), entry.getValue());
            }
        }

        String contentType = config.getContentType() != null ? config.getContentType() : MediaType.APPLICATION_JSON_VALUE;
        headers.setContentType(MediaType.valueOf(contentType));

        byte[] bytes = config.getResponseContent().getBytes(StandardCharsets.UTF_8);
        headers.setContentLength(bytes.length);
        DataBuffer buffer = new DefaultDataBufferFactory().wrap(bytes);

        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), MockPluginConfig.class);
    }
}
