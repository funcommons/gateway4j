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
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

public class CryptorRequestPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(CryptorRequestPlugin.class);
    private static final int MAX_BODY_SIZE = 1024 * 1024;

    private volatile CryptorPluginConfig config;

    public CryptorRequestPlugin() {
        super(BuiltinPluginConstants.CRYPTOR_REQUEST, "请求加解密插件", "PRE", 23);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getDecryptFields() == null || config.getDecryptFields().isEmpty()) {
            return chain.execute(exchange);
        }

        MediaType contentType = exchange.getRequest().getHeaders().getContentType();
        if (contentType == null || !contentType.isCompatibleWith(MediaType.APPLICATION_JSON)) {
            return chain.execute(exchange);
        }

        return DataBufferUtils.join(exchange.getRequest().getBody(), MAX_BODY_SIZE)
                .flatMap(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    String body = new String(bytes, StandardCharsets.UTF_8);

                    String modified = decryptFields(body);
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
        this.config = JsonUtils.parseObject(config.config(), CryptorPluginConfig.class);
    }

    private String decryptFields(String jsonBody) {
        try {
            com.jayway.jsonpath.Configuration conf = com.jayway.jsonpath.Configuration.builder()
                    .options(Option.SUPPRESS_EXCEPTIONS)
                    .build();
            DocumentContext context = JsonPath.using(conf).parse(jsonBody);

            for (String fieldPath : config.getDecryptFields()) {
                Object value = context.read(fieldPath);
                if (value instanceof String strValue) {
                    String decrypted = decrypt(strValue);
                    if (decrypted != null) {
                        context.set(fieldPath, decrypted);
                    }
                }
            }
            return context.jsonString();
        } catch (Exception e) {
            log.warn("Request decrypt failed: {}", e.getMessage());
            return jsonBody;
        }
    }

    private String decrypt(String encrypted) {
        try {
            String algorithm = config.getAlgorithm() != null ? config.getAlgorithm() : "AES";
            SecretKeySpec keySpec = new SecretKeySpec(config.getSecretKey().getBytes(StandardCharsets.UTF_8), algorithm);
            Cipher cipher = Cipher.getInstance(algorithm);
            cipher.init(Cipher.DECRYPT_MODE, keySpec);
            byte[] decoded = Base64.getDecoder().decode(encrypted);
            byte[] decrypted = cipher.doFinal(decoded);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.debug("Decrypt failed for field: {}", e.getMessage());
            return null;
        }
    }
}
