package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.gateway4j.admin.service.ConfigService;
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

    public ConfigController(ConfigService configService) {
        this.configService = configService;
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
