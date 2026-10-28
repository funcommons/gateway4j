package fun.commons.gateway4j.plugin.builtins.sign;

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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public class SignPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(SignPlugin.class);
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final long DEFAULT_DELAY_MINUTES = 5;

    private volatile SignPluginConfig config;

    public SignPlugin() {
        super(BuiltinPluginConstants.SIGN, "签名验证插件", "PRE", 4);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        if (config.getAppKey() == null || config.getAppKey().isBlank()
                || config.getAppSecret() == null || config.getAppSecret().isBlank()) {
            return chain.execute(exchange);
        }

        String appKeyHeader = config.getAppKeyHeader() != null ? config.getAppKeyHeader() : "appKey";
        String timestampHeader = config.getTimestampHeader() != null ? config.getTimestampHeader() : "timestamp";
        String signHeader = config.getSignHeader() != null ? config.getSignHeader() : "sign";

        String appKey = exchange.getRequest().getHeaders().getFirst(appKeyHeader);
        String timestamp = exchange.getRequest().getHeaders().getFirst(timestampHeader);
        String sign = exchange.getRequest().getHeaders().getFirst(signHeader);

        if (appKey == null || timestamp == null || sign == null) {
            log.warn("Sign verification failed: missing required headers");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        if (!config.getAppKey().equals(appKey)) {
            log.warn("Sign verification failed: appKey mismatch");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        long delayMinutes = config.getDelayMinutes() != null ? config.getDelayMinutes() : DEFAULT_DELAY_MINUTES;
        try {
            long ts = Long.parseLong(timestamp);
            long diff = Math.abs(System.currentTimeMillis() - ts);
            if (diff > delayMinutes * 60 * 1000L) {
                log.warn("Sign verification failed: timestamp expired, diff={}ms", diff);
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
        } catch (NumberFormatException e) {
            log.warn("Sign verification failed: invalid timestamp format");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String path = exchange.getRequest().getURI().getPath();
        String query = exchange.getRequest().getURI().getRawQuery();
        String fullPath = query != null ? path + "?" + query : path;
        String algorithm = config.getAlgorithm() != null ? config.getAlgorithm() : HMAC_SHA256;
        String expectedSign = generateSign(config.getAppSecret(), appKey, timestamp, fullPath, algorithm);

        if (!constantTimeEquals(expectedSign, sign)) {
            log.warn("Sign verification failed: signature mismatch");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), SignPluginConfig.class);
    }

    String generateSign(String secret, String appKey, String timestamp, String path, String algorithm) {
        String data = appKey + timestamp + path;
        try {
            Mac mac = Mac.getInstance(algorithm);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), algorithm));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            log.error("Failed to generate sign with algorithm {}", algorithm, e);
            return "";
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        byte[] aBytes = a.getBytes(StandardCharsets.UTF_8);
        byte[] bBytes = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(aBytes, bBytes);
    }
}
