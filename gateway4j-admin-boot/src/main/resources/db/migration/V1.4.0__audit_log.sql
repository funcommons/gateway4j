-- ============================================================================
-- V1.4.0__audit_log.sql
-- 审计落库（P1-4）：framework4j-audit JdbcAuditSink 的目标表。
-- 列名/列序与 framework4j-audit v1.2.1 JdbcAuditSink 的 INSERT 语句逐字对齐：
--   INSERT INTO {table} (action, target_type, target_id, actor, result,
--     error_message, args_json, result_json, ip, user_agent, trace_id,
--     timestamp, prev_hash, hash) VALUES (...)
--   SELECT hash FROM {table} ORDER BY id DESC LIMIT 1  （Hash Chain 取尾）
-- user_agent 由 sink 截断到 255；timestamp 由 sink 以 java.sql.Timestamp 写入。
-- 此前无此表 + 管理面上下文无裸 DataSource Bean，审计一直回落
-- InMemoryAuditSink（重启即丢）；落库装配见 AuditPersistenceConfiguration。
-- 分区/索引从简（任务口径）：仅 created_at 索引 + Hash Chain 取尾依赖的 id 主键。
-- ============================================================================

CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    action        VARCHAR(128) NOT NULL,
    target_type   VARCHAR(64),
    target_id     VARCHAR(128),
    actor         VARCHAR(128),
    result        VARCHAR(32),
    error_message TEXT,
    args_json     TEXT,
    result_json   TEXT,
    ip            VARCHAR(64),
    user_agent    VARCHAR(255),
    trace_id      VARCHAR(64),
    "timestamp"   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prev_hash     VARCHAR(64),
    hash          VARCHAR(64)  NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_log IS '管理面审计日志（framework4j-audit JdbcAuditSink，Hash Chain 防篡改）';
COMMENT ON COLUMN audit_log.action IS '操作动作（如 CREATE_ROUTE/UPDATE_PLUGIN）';
COMMENT ON COLUMN audit_log.target_type IS '目标类型（ROUTE/PLUGIN/CONFIG...）';
COMMENT ON COLUMN audit_log.target_id IS '目标 ID（@Auditable targetIdSpel）';
COMMENT ON COLUMN audit_log.actor IS '操作人（X-User-Id header 或 fallback anonymous）';
COMMENT ON COLUMN audit_log.result IS '操作结果（SUCCESS/ERROR）';
COMMENT ON COLUMN audit_log.prev_hash IS '前一条审计记录 hash（链式防篡改，首条为 GENESIS）';
COMMENT ON COLUMN audit_log.hash IS '本条记录 hash（SHA-256）';

CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX idx_audit_log_action_ts ON audit_log (action, "timestamp");
