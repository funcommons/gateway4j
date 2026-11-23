-- ============================================================================
-- V1.7.0__route_predicate.sql
-- 路由级 SCG 原生谓词（S12-1）：新表 gw_route_predicate
--
-- 背景（docs/ui-v2/实施契约.md §10，2026-11-23 用户裁决「路由创建 100% SCG 对齐」）：
--   既有 gw_route 只有 path 一列，路由注册时（gateway4j-engine
--   DynamicRouteLocator）**只注册了一个 PathPattern 谓词**，其余 host/method/
--   cookie/remote-addr/时间窗条件全靠 gateway4j 自研 RouteConditionMatcher 近似，
--   9/13 类条件与 SCG 有可观测行为差异，且自研 matcher 表达不了 host AND path。
--
-- 本表给每条路由挂若干条 **SCG 原生 shortcut 定义串**（definition），引擎注册
-- 路由时用 SCG 自己的 RoutePredicateFactory + ConfigurationService 绑定，并与
-- 既有 Path 谓词 AND 组合 → 语义由构造保证 100% 对齐。
--
-- definition 口径（SCG 原生 shortcut，逗号分隔多值）：
--   Host=**.example.com          AntPathMatcher('.') 口径，能匹配裸域 example.com
--   Method=GET,POST              多值 + 大小写敏感（HttpMethod 枚举）
--   Cookie=session,^v1$          name + regexp，全串 matches（非子串 find）
--   RemoteAddr=10.0.0.0/8        CIDR，IpSubnetFilterRule 口径
--   After=2026-01-01T00:00:00+08:00 / Before=...   带时区偏移的 ISO-8601 时刻
--   Between=start,end / Header=name,regexp / Query=param,regexp
--
-- 列类型口径对齐 V1.0.0__init_schema.sql（gw_route 等）：id BIGSERIAL 主键、
-- TIMESTAMPTZ 时间戳 + set_updated_at() 触发器、is_deleted SMALLINT 逻辑删除位。
-- 幂等：CREATE TABLE/INDEX IF NOT EXISTS + 触发器 DO $$ 存在性判定。
-- ============================================================================

CREATE TABLE IF NOT EXISTS gw_route_predicate (
    id         BIGSERIAL    PRIMARY KEY,
    route_id   BIGINT       NOT NULL,
    definition VARCHAR(500) NOT NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    is_deleted SMALLINT     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_route_predicate_route ON gw_route_predicate (route_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gw_route_predicate_updated_at') THEN
        CREATE TRIGGER trg_gw_route_predicate_updated_at
            BEFORE UPDATE ON gw_route_predicate
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

COMMENT ON TABLE gw_route_predicate IS '路由级 SCG 原生谓词（S12-1）：definition 存 SCG shortcut 定义串';
COMMENT ON COLUMN gw_route_predicate.id IS '主键（序列自增）';
COMMENT ON COLUMN gw_route_predicate.route_id IS '所属路由 gw_route.id';
COMMENT ON COLUMN gw_route_predicate.definition IS 'SCG 原生 shortcut 定义串，如 Host=**.example.com / Method=GET,POST';
COMMENT ON COLUMN gw_route_predicate.sort_order IS '排序号（同一路由内多条谓词的求值顺序）';
COMMENT ON COLUMN gw_route_predicate.is_deleted IS '逻辑删除位（0 未删除 / 1 已删除）';
COMMENT ON COLUMN gw_route_predicate.created_at IS '创建时间';
COMMENT ON COLUMN gw_route_predicate.updated_at IS '更新时间（set_updated_at() 触发器维护）';
