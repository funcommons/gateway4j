-- ============================================================================
-- V1.4.1__route_environment.sql
-- P2-2 多环境管理（phase-1）：gw_route 增加 environment 列。
--
-- 设计口径：
--   * 单环境部署零行为变化 —— 全部存量行落 'default'，数据面 gateway4j.env
--     缺省即 'default'，装载结果与迁移前完全一致；
--   * 路由名唯一性从「全局唯一」放宽为「同环境内唯一」：V1.0.0 的 uk_route_name
--     是 (route_name) WHERE is_deleted = 0 的部分唯一索引，这里 DROP 旧索引 +
--     CREATE 新 (environment, route_name) 部分唯一索引，命名规范对齐
--     uk_<table>_<cols> 惯例；
--   * 旧导入包 / 旧请求不带 environment 字段 → 落 'default'（列有 DEFAULT）。
-- ============================================================================
ALTER TABLE gw_route ADD COLUMN environment VARCHAR(20) NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS uk_route_name;
CREATE UNIQUE INDEX uk_route_environment_name
    ON gw_route (environment, route_name)
    WHERE is_deleted = 0;

COMMENT ON COLUMN gw_route.environment IS '环境标识（default=默认环境），^[a-z0-9_-]{1,20}$，数据面按 gateway4j.env 装载';
