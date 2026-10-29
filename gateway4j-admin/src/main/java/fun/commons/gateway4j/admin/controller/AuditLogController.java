package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.model.AuditLog;
import fun.commons.gateway4j.admin.service.AuditLogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 变更记录升级（P2-6）：audit_log 审计日志查询端点。
 *
 * <p>契约固定给前端系统设置-变更记录 Tab 切换：信封分页形状与全站一致
 * （data.records / data.total），id 经全局 Jackson Long→String 契约序列化为字符串。
 * 条件参数全部可选；action/actor 等值、target 对 target_id 模糊、from/to 按
 * created_at 过滤（yyyy-MM-dd 或 ISO-8601）。排序 id 倒序。</p>
 */
@RestController
@RequestMapping("/v1/audit")
@RequiresToken("BEARER")
public class AuditLogController {

    private final AuditLogService auditLogService;

    public AuditLogController(AuditLogService auditLogService) {
        this.auditLogService = auditLogService;
    }

    @GetMapping("/logs")
    public ApiResponse<Page<AuditLog>> listLogs(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String target,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        if (page < 1) {
            page = 1;
        }
        if (pageSize < 1) {
            pageSize = 20;
        }
        return ApiResponse.success(auditLogService.listLogs(page, pageSize, action, actor,
                target,
                AuditLogService.parseTimeBound(from, false),
                AuditLogService.parseTimeBound(to, true)));
    }
}
