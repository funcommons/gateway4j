package fun.commons.gateway4j.plugin.builtins.cryptor;

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
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

public class CryptorResponsePlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(CryptorResponsePlugin.class);

    private volatile CryptorPluginConfig config;

    public CryptorResponsePlugin() {
        super(BuiltinPluginConstants.CRYPTOR_RESPONSE, "响应加解密插件", "POST", 23);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getEncryptFields() == null || config.getEncryptFields().isEmpty()) {
            return chain.execute(exchange);
        }

        ServerWebExchange mutated = exchange.mutate().response(new EncryptingDecorator(exchange)).build();
        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), CryptorPluginConfig.class);
    }

    private String encryptFields(String jsonBody) {
        try {
            com.jayway.jsonpath.Configuration conf = com.jayway.jsonpath.Configuration.builder()
                    .options(Option.SUPPRESS_EXCEPTIONS)
                    .build();
            DocumentContext context = JsonPath.using(conf).parse(jsonBody);

            for (String fieldPath : config.getEncryptFields()) {
                Object value = context.read(fieldPath);
                if (value instanceof String strValue) {
                    String encrypted = encrypt(strValue);
                    if (encrypted != null) {
                        context.set(fieldPath, encrypted);
                    }
                }
            }
            return context.jsonString();
        } catch (Exception e) {
            log.warn("Response encrypt failed: {}", e.getMessage());
            return jsonBody;
        }
    }

    private String encrypt(String plainText) {
        try {
            String algorithm = config.getAlgorithm() != null ? config.getAlgorithm() : "AES";
            SecretKeySpec keySpec = new SecretKeySpec(config.getSecretKey().getBytes(StandardCharsets.UTF_8), algorithm);
            Cipher cipher = Cipher.getInstance(algorithm);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec);
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            log.debug("Encrypt failed for field: {}", e.getMessage());
            return null;
        }
    }

    private class EncryptingDecorator extends ServerHttpResponseDecorator {

        private final ServerWebExchange exchange;

        EncryptingDecorator(ServerWebExchange exchange) {
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
                            String modified = encryptFields(bodyStr);
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
