package fun.commons.gateway4j.plugin.builtins.modifyresponse;

import fun.commons.gateway4j.common.util.JsonUtils;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.Option;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public class ModifyResponsePlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(ModifyResponsePlugin.class);

    private volatile ModifyResponsePluginConfig config;

    public ModifyResponsePlugin() {
        super(BuiltinPluginConstants.MODIFY_RESPONSE, "响应修改插件", "POST", 1);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        boolean hasOperations = (config.getAddHeaders() != null && !config.getAddHeaders().isEmpty())
                || (config.getReplaceHeaders() != null && !config.getReplaceHeaders().isEmpty())
                || (config.getRemoveHeaders() != null && !config.getRemoveHeaders().isEmpty())
                || (config.getStatusCode() != null)
                || (config.getAddBodyKeys() != null && !config.getAddBodyKeys().isEmpty())
                || (config.getRemoveBodyKeys() != null && !config.getRemoveBodyKeys().isEmpty())
                || (config.getReplaceBodyKeys() != null && !config.getReplaceBodyKeys().isEmpty());

        if (!hasOperations) {
            return chain.execute(exchange);
        }

        modifyHeaders(exchange);
        modifyStatusCode(exchange);

        boolean hasBodyOps = (config.getAddBodyKeys() != null && !config.getAddBodyKeys().isEmpty())
                || (config.getRemoveBodyKeys() != null && !config.getRemoveBodyKeys().isEmpty())
                || (config.getReplaceBodyKeys() != null && !config.getReplaceBodyKeys().isEmpty());

        if (!hasBodyOps) {
            return chain.execute(exchange);
        }

        ServerWebExchange mutated = exchange.mutate().response(new BodyModifyingDecorator(exchange)).build();
        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), ModifyResponsePluginConfig.class);
    }

    private void modifyHeaders(ServerWebExchange exchange) {
        HttpHeaders headers = exchange.getResponse().getHeaders();

        if (config.getAddHeaders() != null) {
            for (Map.Entry<String, String> entry : config.getAddHeaders().entrySet()) {
                headers.add(entry.getKey(), entry.getValue());
            }
        }
        if (config.getReplaceHeaders() != null) {
            for (Map.Entry<String, String> entry : config.getReplaceHeaders().entrySet()) {
                headers.set(entry.getKey(), entry.getValue());
            }
        }
        if (config.getRemoveHeaders() != null) {
            for (String key : config.getRemoveHeaders()) {
                headers.remove(key);
            }
        }
    }

    private void modifyStatusCode(ServerWebExchange exchange) {
        if (config.getStatusCode() != null) {
            try {
                exchange.getResponse().setStatusCode(HttpStatus.valueOf(config.getStatusCode()));
            } catch (IllegalArgumentException e) {
                log.warn("Invalid status code: {}", config.getStatusCode());
            }
        }
    }

    private String applyBodyMappings(String jsonBody) {
        try {
            com.jayway.jsonpath.Configuration conf = com.jayway.jsonpath.Configuration.builder()
                    .options(Option.SUPPRESS_EXCEPTIONS)
                    .build();
            DocumentContext context = JsonPath.using(conf).parse(jsonBody);

            if (config.getAddBodyKeys() != null) {
                for (Map.Entry<String, Object> entry : config.getAddBodyKeys().entrySet()) {
                    context.put("$", entry.getKey(), entry.getValue());
                }
            }
            if (config.getReplaceBodyKeys() != null) {
                for (Map.Entry<String, String> entry : config.getReplaceBodyKeys().entrySet()) {
                    context.renameKey("$", entry.getKey(), entry.getValue());
                }
            }
            if (config.getRemoveBodyKeys() != null) {
                for (String path : config.getRemoveBodyKeys()) {
                    context.delete(path);
                }
            }
            return context.jsonString();
        } catch (Exception e) {
            log.warn("Body mapping failed: {}", e.getMessage());
            return jsonBody;
        }
    }

    private class BodyModifyingDecorator extends ServerHttpResponseDecorator {

        private final ServerWebExchange exchange;

        BodyModifyingDecorator(ServerWebExchange exchange) {
            super(exchange.getResponse());
            this.exchange = exchange;
        }

        @Override
        public Mono<Void> writeWith(org.reactivestreams.Publisher<? extends DataBuffer> body) {
            if (body instanceof Flux) {
                Flux<? extends DataBuffer> flux = (Flux<? extends DataBuffer>) body;
                return super.writeWith(flux.reduce(new StringBuilder(),
                                (sb, buf) -> sb.append(buf.toString(StandardCharsets.UTF_8)))
                        .map(StringBuilder::toString)
                        .flatMap(bodyStr -> {
                            String modified = applyBodyMappings(bodyStr);
                            byte[] bytes = modified.getBytes(StandardCharsets.UTF_8);
                            getHeaders().setContentLength(bytes.length);
                            DataBuffer buffer = new DefaultDataBufferFactory().wrap(bytes);
                            return Mono.just(buffer);
                        }));
            }
            return super.writeWith(body);
        }
    }
}
