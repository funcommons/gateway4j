package fun.commons.gateway4j.gateway.web;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 404 兜底（网关数据面）：SCG 没有任何路由匹配时，DispatcherHandler 落到静态资源
 * 处理并抛出 {@link NoResourceFoundException}；framework4j-web 的全局兜底
 * advice 会把它吞成 500「系统繁忙」，掩盖了"路径未注册"的真实语义。
 *
 * 这里用最高优先级的 advice 先行接管该异常，返回 404 + 统一信封结构，
 * 保证"未匹配任何路由 = 网关明确的 404（非转发）"。
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GatewayErrorAdvice {

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", 404);
        body.put("message", "Not Found: " + (e.getReason() != null ? e.getReason() : e.getMessage()));
        body.put("data", null);
        body.put("success", false);
        body.put("fail", true);
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }
}
