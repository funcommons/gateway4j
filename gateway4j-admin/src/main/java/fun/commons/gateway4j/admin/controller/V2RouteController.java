package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.RouteDecisionTreeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * V2 路由控制器（UI v2，契约 §4 S7，docs/ui-v2/实施契约.md）。
 *
 * <p>类级 {@code /v1/v2/routes} 是 v2 命名空间：S7 决策树与后续 S11
 * {@code /v1/v2/debug} 共用（RouteController 类级 /v1/routes 拼不出 /v1/v2，
 * 故新建本控制器）；鉴权沿用类级 {@code @RequiresToken("BEARER")}，与
 * RouteController/MonitorController 同款风格。</p>
 */
@RestController
@RequestMapping("/v1/v2/routes")
@RequiresToken("BEARER")
public class V2RouteController {

    private final RouteDecisionTreeService decisionTreeService;

    public V2RouteController(RouteDecisionTreeService decisionTreeService) {
        this.decisionTreeService = decisionTreeService;
    }

    /**
     * 路由决策树聚合（含 WEIGHT/条件分支、嵌套深 ≤5、hit_ratio/totals 流量指标）。
     * 纯委托：routeId 不存在时 service 抛 BusinessException，不在此吞——由
     * GlobalExceptionHandler 统一转 ApiResponse 失败信封。
     */
    @GetMapping("/{id}/decision-tree")
    public ApiResponse<Map<String, Object>> decisionTree(@PathVariable Long id) {
        return ApiResponse.success(decisionTreeService.decisionTree(id));
    }
}
