-- ============================================================================
-- V1.2.0__gw_config.sql
-- 系统设置存储（gw_config）：config_type → JSON 配置键值表
-- 修复 D4：前端 GET/PUT /v1/config/{configType}（site_name/language/
-- token_expiry_hours/refresh_expiry_days）此前无后端承载
-- ============================================================================

CREATE TABLE gw_config (
    config_type  VARCHAR(50) NOT NULL,
    config_data  JSONB       NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (config_type)
);

CREATE TRIGGER trg_gw_config_updated_at
    BEFORE UPDATE ON gw_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_config IS '系统设置';
COMMENT ON COLUMN gw_config.config_type IS '配置类型（业务主键，如 system）';
COMMENT ON COLUMN gw_config.config_data IS '配置内容（JSONB）';
COMMENT ON COLUMN gw_config.updated_at IS '更新时间';
