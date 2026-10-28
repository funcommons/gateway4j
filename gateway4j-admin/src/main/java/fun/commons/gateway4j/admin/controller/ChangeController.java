package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.gateway4j.admin.service.ChangeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 变更时间线（阶段二 T5）：路由与插件变更混合倒序列表。
 */
@RestController
@RequestMapping("/v1/changes")
@RequiresToken("BEARER")
public class ChangeController {

    private final ChangeService changeService;

    public ChangeController(ChangeService changeService) {
        this.changeService = changeService;
    }

    @GetMapping
    public List<Map<String, Object>> listChanges(@RequestParam(required = false) Integer limit) {
        return changeService.listChanges(limit);
    }
}
