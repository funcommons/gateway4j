package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.model.V2DebugReplayRequest;
import fun.commons.gateway4j.admin.service.DebugReplayService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * V2 调试回放控制器（UI v2，契约 docs/ui-v2/实施契约.md S11a，2026-11-05 已裁决）。
 *
 * <p>类级 {@code /v1/v2/debug} 属 v2 命名空间（V2RouteController javadoc 已预留，
 * /v1/v2/routes 同款风格）；鉴权类级 {@code @RequiresToken("BEARER")}。route_id
 * 走查询参数 {@code route_id}（request record 只含 path/method/headers/query/body
 * 五分量，routeId 只能置于 URL），请求体为 {@link V2DebugReplayRequest}。纯委托：
 * service 抛 BusinessException 不在此吞，由 GlobalExceptionHandler 统一转失败信封。</p>
 */
@RestController
@RequestMapping("/v1/v2/debug")
@RequiresToken("BEARER")
public class V2DebugController {

    private final DebugReplayService debugReplayService;

    public V2DebugController(DebugReplayService debugReplayService) {
        this.debugReplayService = debugReplayService;
    }

    /**
     * 影子回放：真实触达网关数据面与上游（S11b 前端须配副作用警示文案），审计
     * action=debug_replay 留痕（targetIdSpel 与 RouteController 既有写法一致）。
     */
    @PostMapping("/replay")
    @Auditable(action = "debug_replay", targetType = "ROUTE", targetIdSpel = "#routeId")
    public ApiResponse<Map<String, Object>> replay(@RequestParam("route_id") Long routeId,
                                                   @RequestBody V2DebugReplayRequest request) {
        return ApiResponse.success(debugReplayService.replay(request, routeId));
    }
}
