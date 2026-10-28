package fun.commons.gateway4j.plugin.builtins.parammapping;

import fun.commons.gateway4j.common.util.JsonUtils;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.Option;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Map;

public class ParamMappingPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(ParamMappingPlugin.class);
    private static final int MAX_BODY_SIZE = 1024 * 1024; // 1MB

    private volatile ParamMappingPluginConfig config;

    public ParamMappingPlugin() {
        super(BuiltinPluginConstants.PARAM_MAPPING, "参数映射插件", "PRE", 22);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        MediaType contentType = exchange.getRequest().getHeaders().getContentType();
        if (contentType == null) {
            return chain.execute(exchange);
        }

        if (contentType.isCompatibleWith(MediaType.APPLICATION_JSON)) {
            return handleJson(exchange, chain);
        }

        if (contentType.isCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED)) {
            return handleFormUrlencoded(exchange, chain);
        }

        return chain.execute(exchange);
    }

    private Mono<Void> handleJson(ServerWebExchange exchange, PluginChain chain) {
        boolean hasOperations = (config.getAddParameterKeys() != null && !config.getAddParameterKeys().isEmpty())
                || (config.getRemoveParameterKeys() != null && !config.getRemoveParameterKeys().isEmpty())
                || (config.getReplaceParameterKeys() != null && !config.getReplaceParameterKeys().isEmpty());

        if (!hasOperations) {
            return chain.execute(exchange);
        }

        return DataBufferUtils.join(exchange.getRequest().getBody(), MAX_BODY_SIZE)
                .flatMap(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    String body = new String(bytes, StandardCharsets.UTF_8);

                    String modified = applyMappings(body);
                    if (modified.equals(body)) {
                        return chain.execute(exchange);
                    }

                    byte[] modifiedBytes = modified.getBytes(StandardCharsets.UTF_8);
                    DataBuffer outBuffer = new DefaultDataBufferFactory().wrap(modifiedBytes);

                    ServerWebExchange mutated = exchange.mutate().request(builder -> {
                        builder.headers(headers -> headers.setContentLength(modifiedBytes.length));
                    }).build();

                    mutated.getAttributes().put(GatewayConstants.PLUGIN_CONTEXT_PREFIX + "mapped_body", Flux.just(outBuffer));
                    return chain.execute(mutated);
                })
                .switchIfEmpty(chain.execute(exchange));
    }

    private Mono<Void> handleFormUrlencoded(ServerWebExchange exchange, PluginChain chain) {
        boolean hasOperations = (config.getAddParameterKeys() != null && !config.getAddParameterKeys().isEmpty())
                || (config.getRemoveParameterKeys() != null && !config.getRemoveParameterKeys().isEmpty())
                || (config.getReplaceParameterKeys() != null && !config.getReplaceParameterKeys().isEmpty());

        if (!hasOperations) {
            return chain.execute(exchange);
        }

        return DataBufferUtils.join(exchange.getRequest().getBody(), MAX_BODY_SIZE)
                .flatMap(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    String body = new String(bytes, StandardCharsets.UTF_8);

                    String modified = applyFormMappings(body);
                    if (modified.equals(body)) {
                        return chain.execute(exchange);
                    }

                    byte[] modifiedBytes = modified.getBytes(StandardCharsets.UTF_8);
                    DataBuffer outBuffer = new DefaultDataBufferFactory().wrap(modifiedBytes);

                    ServerWebExchange mutated = exchange.mutate().request(builder -> {
                        builder.headers(headers -> headers.setContentLength(modifiedBytes.length));
                    }).build();

                    mutated.getAttributes().put(GatewayConstants.PLUGIN_CONTEXT_PREFIX + "mapped_body", Flux.just(outBuffer));
                    return chain.execute(mutated);
                })
                .switchIfEmpty(chain.execute(exchange));
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), ParamMappingPluginConfig.class);
    }

    private String applyMappings(String jsonBody) {
        try {
            com.jayway.jsonpath.Configuration conf = com.jayway.jsonpath.Configuration.builder()
                    .options(Option.SUPPRESS_EXCEPTIONS)
                    .build();
            DocumentContext context = JsonPath.using(conf).parse(jsonBody);

            if (config.getAddParameterKeys() != null) {
                for (ParamMapInfo info : config.getAddParameterKeys()) {
                    String path = info.getPath() != null ? info.getPath() : "$";
                    context.put(path, info.getKey(), info.getValue());
                }
            }

            if (config.getReplaceParameterKeys() != null) {
                for (ParamMapInfo info : config.getReplaceParameterKeys()) {
                    String path = info.getPath() != null ? info.getPath() : "$";
                    context.renameKey(path, info.getKey(), info.getValue());
                }
            }

            if (config.getRemoveParameterKeys() != null) {
                for (String path : config.getRemoveParameterKeys()) {
                    context.delete(path);
                }
            }

            return context.jsonString();
        } catch (Exception e) {
            log.warn("Param mapping failed, passing through original body: {}", e.getMessage());
            return jsonBody;
        }
    }

    private String applyFormMappings(String formBody) {
        try {
            Map<String, String> params = new LinkedHashMap<>();
            if (!formBody.isEmpty()) {
                for (String pair : formBody.split("&")) {
                    String[] kv = pair.split("=", 2);
                    String key = URLDecoder.decode(kv[0], StandardCharsets.UTF_8);
                    String value = kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "";
                    params.put(key, value);
                }
            }

            if (config.getAddParameterKeys() != null) {
                for (ParamMapInfo info : config.getAddParameterKeys()) {
                    params.put(info.getKey(), info.getValue() != null ? info.getValue() : "");
                }
            }
            if (config.getReplaceParameterKeys() != null) {
                for (ParamMapInfo info : config.getReplaceParameterKeys()) {
                    String oldKey = info.getKey();
                    String newKey = info.getValue();
                    if (params.containsKey(oldKey) && newKey != null) {
                        String val = params.remove(oldKey);
                        params.put(newKey, val);
                    }
                }
            }
            if (config.getRemoveParameterKeys() != null) {
                for (String key : config.getRemoveParameterKeys()) {
                    params.remove(key);
                }
            }

            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, String> entry : params.entrySet()) {
                if (sb.length() > 0) sb.append("&");
                sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                        .append("=")
                        .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("Form param mapping failed, passing through original body: {}", e.getMessage());
            return formBody;
        }
    }
}
