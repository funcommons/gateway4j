-- ============================================================================
-- V1.5.2__audit_log_timestamptz_fix.sql
-- audit_log 时区债修复（S11 遗留缺陷）：timestamp/created_at 误用 TIMESTAMP
-- （无时区）导致本地 +08 挂钟时间被当 UTC 语义读出，全站审计时间显示 +8h。
--
-- 缺陷机理（DB 实测 16:19+08 事件 → audit_log.created_at 存 16:19:08，
-- 读侧按 UTC 解释 → 16:19:08+00，偏移 +8h；同事件 gw_route_version.published_at
-- 正确存 08:19:08+00）：
--   * created_at 不在 JdbcAuditSink 的 INSERT 列序内，由列缺省
--     CURRENT_TIMESTAMP（timestamptz）填充，V1.4.0 将列建成 TIMESTAMP，
--     隐式转换按会话时区（= JVM 缺省 Asia/Shanghai +08）截掉偏移 → 存本地挂钟；
--   * "timestamp" 列由 sink 以 java.sql.Timestamp 写入，同理按会话时区渲染
--     成本地挂钟落入 TIMESTAMP 列。
--
-- 修法（照 gw_route_version.published_at 同款——TIMESTAMPTZ 存绝对时刻）：
--   USING col AT TIME ZONE 'Asia/Shanghai' 把存量行的 +08 挂钟时间解释为
--   +08 本地 → 转成正确 UTC 时刻，一步完成「列类型订正 + 存量订正」。
--   注意必须用具名时区而非 '+08:00' 字面量：PostgreSQL 对无符号数字区域串
--   按 POSIX 约定解释（符号反转 = UTC-8），实测 '+08:00' 会产生 +16h 二次
--   偏移（本票 Testcontainers 对照测试钉住该回归）；Asia/Shanghai 全年 +08
--   无夏令时，与缺陷写入环境（JVM 缺省时区）一致。
--   转为 TIMESTAMPTZ 后，列缺省 CURRENT_TIMESTAMP 与 sink 写入均按绝对时刻
--   语义落库，与部署机时区解耦（framework JdbcAuditSink 自身 DDL 亦为
--   TIMESTAMPTZ，框架文件不动，本迁移即 gateway4j 侧写路径修复）。
--
-- 存量订正范围裁决依据：
--   * audit_log 全部存量行均出自同一写路径（V1.4.0 建表后的 sink INSERT +
--     AuditStartupProbe 探针，探针行即时删除不入链），挂钟时间一律为
--     +08 本地形态，全表订正；
--   * 仓库内无任何时区环境配置史（application.yml / 部署脚本均未设 TZ，
--     开发与部署环境固定 +08，无夏令时），不存在异形态行，无需行级甄别；
--   * 防呆（对「未来已正确行」不二次偏移）：ALTER TYPE 由 Flyway 保证仅执行
--     一次；迁移后新行走 TIMESTAMPTZ 绝对时刻语义，与本订正天然隔离。
--   * hash 列不参与本订正：Hash Chain 摘要由框架在写入时以 Java Instant
--     计算，不读回 DB 时间列，改列类型/订正存量不影响链校验。
-- ============================================================================

ALTER TABLE audit_log
    ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ
    USING "timestamp" AT TIME ZONE 'Asia/Shanghai';

ALTER TABLE audit_log
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'Asia/Shanghai';

COMMENT ON COLUMN audit_log."timestamp" IS
    '操作时刻（TIMESTAMPTZ 绝对时刻，V1.5.2 订正；V1.4.0~V1.5.1 误存 +08 挂钟）';
COMMENT ON COLUMN audit_log.created_at IS
    '落库时刻（TIMESTAMPTZ 绝对时刻，V1.5.2 订正；V1.4.0~V1.5.1 误存 +08 挂钟）';
