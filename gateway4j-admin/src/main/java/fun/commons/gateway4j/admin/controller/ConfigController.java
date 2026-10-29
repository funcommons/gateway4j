package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.gateway4j.admin.service.ConfigService;
import fun.commons.gateway4j.admin.service.ConfigSyncStatusService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 系统设置（修复 D4）：GET/PUT /v1/config/{configType}，
 * 配置体为任意 JSON 对象（system: site_name/language/token_expiry_hours/refresh_expiry_days）。
 */
@RestController
@RequestMapping("/v1/config")
@RequiresToken("BEARER")
public class ConfigController {

    private final ConfigService configService;
    private final ConfigSyncStatusService configSyncStatusService;

    public ConfigController(ConfigService configService,
                            ConfigSyncStatusService configSyncStatusService) {
        this.configService = configService;
        this.configSyncStatusService = configSyncStatusService;
    }

    /**
     * 发布生效确认（P1-3）：读网关 reload 水位（Redis gateway4j:config:sync，TTL 120s）
     * 比对 DB 全局 config_version。字面路径优先于 /{configType} 模板匹配（Spring MVC 精确优先）。
     * Redis 缺失/拒连 → available=false，绝不 500。
     */
    @GetMapping("/sync-status")
    public Map<String, Object> syncStatus() {
        return configSyncStatusService.readSyncStatus();
    }

    @GetMapping("/{configType}")
    public Map<String, Object> getConfig(@PathVariable String configType) {
        return configService.getConfig(configType);
    }

    @PutMapping("/{configType}")
    @Auditable(action = "UPDATE_CONFIG", targetType = "CONFIG", targetIdSpel = "#configType")
    public Map<String, Object> saveConfig(@PathVariable String configType,
                                          @RequestBody Map<String, Object> body) {
        return configService.saveConfig(configType, body);
    }
}
