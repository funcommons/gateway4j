package fun.commons.gateway4j.engine.web;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.util.JsonUtils;
import org.springframework.core.io.buffer.DataBufferFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Data-plane error envelope helpers shared by the engine's filters
 * ({@code DispatchRoutingFilter} 404/502, {@code FailSafePluginChainRunner}
 * on_error=close 503) and gateway-boot's {@code GatewayErrorAdvice} — one
 * implementation so the JSON shape and the {@code X-Trace-Id} header stay
 * identical everywhere the gateway answers itself instead of forwarding.
 *
 * <p>Envelope shape (same as GatewayErrorAdvice, framework4j ApiResponse style):
 * {@code {"code":N,"message":"...","data":null,"success":false,"fail":true}}.</p>
 *
 * <p>Trace id: the engine trace attribute ({@code gw4j:traceId}, set by
 * TracingPlugin) when present, else a fresh random UUID. Both call sites resolve
 * the id through {@link #traceId(ServerWebExchange)} so generation is identical.</p>
 */
public final class GatewayErrorResponses {

    public static final String TRACE_HEADER = "X-Trace-Id";

    private GatewayErrorResponses() {}

    /** Trace id for the exchange: engine trace attribute when set, else a random UUID. */
    public static String traceId(ServerWebExchange exchange) {
        Object traceId = exchange.getAttribute(GatewayConstants.TRACE_ID_KEY);
        return traceId instanceof String s && !s.isBlank() ? s : UUID.randomUUID().toString();
    }

    /** Envelope body ({@code code/message/data/success/fail}) as a ordered map. */
    public static Map<String, Object> envelope(int code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        body.put("data", null);
        body.put("success", false);
        body.put("fail", true);
        return body;
    }

    /** Envelope body ({@code code/message/data/success/fail}) as compact JSON bytes. */
    public static byte[] envelopeBytes(int code, String message) {
        return JsonUtils.toCompactJson(envelope(code, message))
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    /**
     * Renders {@code status} + JSON envelope + {@code X-Trace-Id} and completes
     * the response. Caller must ensure the response is not committed yet.
     */
    public static Mono<Void> respond(ServerWebExchange exchange, HttpStatus status, String message) {
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        exchange.getResponse().getHeaders().set(TRACE_HEADER, traceId(exchange));
        DataBufferFactory buffers = exchange.getResponse().bufferFactory();
        return exchange.getResponse()
                .writeWith(Mono.just(buffers.wrap(envelopeBytes(status.value(), message))));
    }
}
