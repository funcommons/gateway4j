package fun.commons.gateway4j.gateway.web;

import fun.commons.gateway4j.engine.web.GatewayErrorResponses;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.resource.NoResourceFoundException;
import org.springframework.web.server.ServerWebExchange;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 404 兜底（网关数据面）：SCG 没有任何路由匹配时，DispatcherHandler 落到静态资源
 * 处理并抛出 {@link NoResourceFoundException}；framework4j-web 的全局兜底
 * advice 会把它吞成 500「系统繁忙」，掩盖了"路径未注册"的真实语义。
 *
 * 这里用最高优先级的 advice 先行接管该异常，返回 404 + 统一信封结构，
 * 保证"未匹配任何路由 = 网关明确的 404（非转发）"。
 *
 * 信封与 {@code X-Trace-Id} 头统一走 engine 的 {@link GatewayErrorResponses}
 * （与 DispatchRoutingFilter 的 404/502、on_error=close 的 503 完全同形）；
 * trace id 优先取引擎 trace 属性（gw4j:traceId，TracingPlugin 设置），否则
 * 生成随机 UUID —— 两处生成方式一致。
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GatewayErrorAdvice {

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException e, ServerWebExchange exchange) {
        String reason = e.getReason() != null ? e.getReason() : e.getMessage();
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .header(GatewayErrorResponses.TRACE_HEADER, GatewayErrorResponses.traceId(exchange))
                .body(GatewayErrorResponses.envelope(404, "Not Found: " + reason));
    }
}
