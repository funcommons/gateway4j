package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.admin.service.MonitorStreamService;
import fun.commons.gateway4j.admin.service.SseTokenValidator;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 监控指标 SSE 端点（P2-7）：GET /v1/monitor/stream，text/event-stream。
 *
 * <p><b>鉴权形态（与全站不同，契约固定）</b>：EventSource 无法携带 Authorization
 * 头，本类不加 @RequiresToken（框架拦截器只认 Header），改用 {@code ?token=}
 * 查询参数 + {@link SseTokenValidator} 手工校验（验签/撤销/Redis nonce 强一致）。
 * 只读监控指标、泄露面小，安全取舍见 SseTokenValidator 与 docs/API_CONTRACT.md。</p>
 *
 * <p>前端用法（契约）：{@code new EventSource('/v1/monitor/stream?token=' + accessToken)}
 * 后 {@code addEventListener('metrics' | 'config_changed')}，data 为 JSON 字符串。</p>
 */
@RestController
@RequestMapping("/v1/monitor")
public class MonitorStreamController {

    private final MonitorStreamService streamService;
    private final SseTokenValidator tokenValidator;

    public MonitorStreamController(MonitorStreamService streamService, SseTokenValidator tokenValidator) {
        this.streamService = streamService;
        this.tokenValidator = tokenValidator;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam(value = "token", required = false) String token,
                             HttpServletResponse response) throws IOException {
        if (!tokenValidator.validate(token)) {
            // 与全站未登录信封同码（10200 UNAUTHORIZED），EventSource 侧仅感知连接失败
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(JsonUtils.toCompactJson(
                    ApiResponse.fail(fun.commons.framework4j.api.ApiCode.UNAUTHORIZED, "未登录或令牌无效")));
            response.getWriter().flush();
            return null;
        }
        return streamService.register();
    }
}
