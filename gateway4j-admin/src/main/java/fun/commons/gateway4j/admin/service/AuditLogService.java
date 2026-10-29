package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.admin.mapper.AuditLogMapper;
import fun.commons.gateway4j.admin.model.AuditLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/**
 * 审计日志查询（P2-6 变更记录升级）：audit_log 分页 + 条件过滤。
 *
 * <p>过滤口径：action/actor 等值，target 对 target_id 模糊（like），from/to 按
 * created_at 闭区间（日期串 yyyy-MM-dd 归一为当日 [00:00, 23:59:59.999999999]）。
 * 排序固定 id 倒序（最新在前，审计追加写天然按时间有序）。</p>
 */
@Slf4j
@Service
public class AuditLogService extends ServiceImpl<AuditLogMapper, AuditLog> {

    /** 每页上限（与全站分页护栏一致）。 */
    public static final int MAX_PAGE_SIZE = 100;

    public Page<AuditLog> listLogs(int page, int pageSize, String action, String actor,
                                   String target, OffsetDateTime from, OffsetDateTime to) {
        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        if (action != null && !action.isBlank()) {
            wrapper.eq(AuditLog::getAction, action.trim());
        }
        if (actor != null && !actor.isBlank()) {
            wrapper.eq(AuditLog::getActor, actor.trim());
        }
        if (target != null && !target.isBlank()) {
            wrapper.like(AuditLog::getTargetId, target.trim());
        }
        if (from != null) {
            wrapper.ge(AuditLog::getCreatedAt, from);
        }
        if (to != null) {
            wrapper.le(AuditLog::getCreatedAt, to);
        }
        wrapper.orderByDesc(AuditLog::getId);
        return page(new Page<>(page, Math.min(pageSize, MAX_PAGE_SIZE)), wrapper);
    }

    /** 日期/时间串解析：yyyy-MM-dd 归一为当日全天（系统时区），其余按 ISO-8601。 */
    public static OffsetDateTime parseTimeBound(String raw, boolean endOfDay) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        try {
            LocalDate date = LocalDate.parse(trimmed);
            return endOfDay
                    ? date.atTime(23, 59, 59, 999_999_999).atZone(ZoneId.systemDefault()).toOffsetDateTime()
                    : date.atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime();
        } catch (DateTimeParseException notDateOnly) {
            try {
                return OffsetDateTime.parse(trimmed);
            } catch (DateTimeParseException notOffset) {
                try {
                    return java.time.LocalDateTime.parse(trimmed)
                            .atZone(ZoneId.systemDefault()).toOffsetDateTime();
                } catch (DateTimeParseException notLocal) {
                    throw new IllegalArgumentException("时间格式非法（须 yyyy-MM-dd 或 ISO-8601）: " + raw);
                }
            }
        }
    }
}
