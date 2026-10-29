package fun.commons.gateway4j.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.admin.model.AuditLog;
import org.apache.ibatis.annotations.Mapper;

/** 审计日志只读 Mapper（P2-6 变更记录升级；写入方是 framework4j-audit JdbcAuditSink）。 */
@Mapper
public interface AuditLogMapper extends BaseMapper<AuditLog> {
}
