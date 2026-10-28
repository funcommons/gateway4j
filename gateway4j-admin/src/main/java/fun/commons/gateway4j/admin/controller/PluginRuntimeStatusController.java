package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.PluginRuntimeStatusService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 内置插件数据面运行时状态查询（管理面只读，数据由 gateway4j-engine reload 后写入 Redis）。
 *
 * <p>key 不存在 / Redis 异常 → 200 + {@code {"available":false,"items":[]}}，
 * 前端据此静默降级（不显示接线徽标），绝不 500。</p>
 */
@RestController
@RequestMapping("/v1/plugins")
@RequiresToken("BEARER")
public class PluginRuntimeStatusController {

    private final PluginRuntimeStatusService pluginRuntimeStatusService;

    public PluginRuntimeStatusController(PluginRuntimeStatusService pluginRuntimeStatusService) {
        this.pluginRuntimeStatusService = pluginRuntimeStatusService;
    }

    /** 数据面插件接线状态：{@code [{plugin_id, phase, registered, updated_at}]}。 */
    @GetMapping("/runtime-status")
    public ApiResponse<Map<String, Object>> runtimeStatus() {
        return ApiResponse.success(pluginRuntimeStatusService.readRuntimeStatus());
    }
}
