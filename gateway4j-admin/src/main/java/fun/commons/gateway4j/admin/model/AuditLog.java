package fun.commons.gateway4j.admin.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/**
 * 审计日志只读视图（P2-6 变更记录升级）。
 *
 * <p>表结构由 {@code V1.4.0__audit_log.sql} 建立（framework4j-audit JdbcAuditSink
 * 的写入目标，列序与框架 INSERT 逐字对齐）。本实体<b>仅查询</b>——写入方是框架
 * AuditSink（Hash Chain 防篡改 append-only），管理面不提供任何写路径。</p>
 *
 * <p>放在 admin 模块（common 模型库不收）：audit_log 是框架基础设施表，非业务域模型。
 * {@code timestamp} 在 PostgreSQL 为 type_func_name 关键字，可不作列名引用，
 * 与 JdbcAuditSink 的裸列名 INSERT 一致。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("audit_log")
public class AuditLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String action;

    private String targetType;

    private String targetId;

    private String actor;

    private String result;

    private String errorMessage;

    private String argsJson;

    private String resultJson;

    private String ip;

    private String userAgent;

    private String traceId;

    /** 操作时间（sink 写入的 java.sql.Timestamp）。 */
    @TableField("timestamp")
    private OffsetDateTime timestamp;

    /** Hash Chain 前向指针（首条 GENESIS），脱敏展示不参与前端。 */
    private String prevHash;

    private String hash;

    private OffsetDateTime createdAt;
}
