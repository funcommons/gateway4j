-- ============================================================================
-- V1.3.0__import_snapshot.sql
-- 导入快照（gw_import_snapshot）：全量路由（含 conditions/bindings）序列化
-- 存档，配合 POST /v1/routes/import/rollback 事务内恢复
-- ============================================================================

CREATE TABLE gw_import_snapshot (
    id            BIGSERIAL,
    snapshot_data JSONB       NOT NULL,
    route_count   INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

COMMENT ON TABLE gw_import_snapshot IS '导入快照';
COMMENT ON COLUMN gw_import_snapshot.id IS '主键';
COMMENT ON COLUMN gw_import_snapshot.snapshot_data IS '快照内容（全量路由+条件+绑定 JSON）';
COMMENT ON COLUMN gw_import_snapshot.route_count IS '快照内路由数量';
COMMENT ON COLUMN gw_import_snapshot.created_at IS '创建时间';
