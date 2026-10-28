-- ============================================================================
-- V1.3.1__route_tags.sql
-- 路由标签：gw_route 增加 tags（逗号分隔字符串，如 prod,pay，≤200 字符），
-- 支持 GET /v1/routes?tag=prod 精确筛选
-- ============================================================================

ALTER TABLE gw_route ADD COLUMN tags VARCHAR(200) NOT NULL DEFAULT '';

COMMENT ON COLUMN gw_route.tags IS '路由标签（逗号分隔字符串，如 prod,pay）';
