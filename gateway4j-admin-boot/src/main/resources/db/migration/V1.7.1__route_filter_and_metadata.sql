-- ============================================================================
-- V1.7.1__route_filter_and_metadata.sql
-- 路由级 SCG 原生 filters + metadata（S12-7a）：新表 gw_route_filter + gw_route.metadata 列
--
-- 背景（docs/ui-v2/实施契约.md §10.1，2026-11-23 用户裁决「要 spring gateway 1:1
-- 对应填写」+「打通 SCG 原生 filters」「metadata 新增落点」）：
--   SCG 的 RouteDefinition = id / uri / predicates / filters / order / metadata / enabled。
--   gateway4j 已补齐 uri（单字段）、predicates（gw_route_predicate，V1.7.0，S12-1）、
--   order（sort_order）、enabled（status='PUBLISHED'）；本迁移补齐最后两个缺口：
--     * filters  → 新表 gw_route_filter（SCG 原生 filter 定义串逐条落行）
--     * metadata → gw_route.metadata（JSONB，与 SCG 的 Map<String,Object> 同形）
--
-- definition 口径（SCG 原生 shortcut，逗号分隔多值，= SCG YAML filters[] 每项）：
--   AddRequestHeader=X-Foo, bar
--   RewritePath=/red/(?<segment>.*), /$\{segment}
--   StripPrefix=1 / PrefixPath=/api / PreserveHostHeader（无参合法形态）
--   SetStatus=301 / RedirectTo=301, https://example.org
--   DedupeResponseHeader=Access-Control-Allow-Credentials
--
-- 列类型口径对齐 V1.7.0__route_predicate.sql（gw_route_predicate）：id BIGSERIAL 主键、
-- TIMESTAMPTZ 时间戳 + set_updated_at() 触发器、is_deleted SMALLINT 逻辑删除位。
-- 幂等：CREATE TABLE/INDEX/ADD COLUMN IF NOT EXISTS + 触发器 DO $$ 存在性判定。
-- ============================================================================

CREATE TABLE IF NOT EXISTS gw_route_filter (
    id         BIGSERIAL    PRIMARY KEY,
    route_id   BIGINT       NOT NULL,
    definition VARCHAR(500) NOT NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    is_deleted SMALLINT     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_route_filter_route ON gw_route_filter (route_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gw_route_filter_updated_at') THEN
        CREATE TRIGGER trg_gw_route_filter_updated_at
            BEFORE UPDATE ON gw_route_filter
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

-- metadata：SCG RouteDefinition.metadata 的 gateway4j 落点（Map<String,Object> 同形）。
-- NOT NULL DEFAULT '{}'：存量行零回填成本，读写两侧均按「非空 JSON object」约定。
ALTER TABLE gw_route ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON TABLE gw_route_filter IS '路由级 SCG 原生 filter（S12-7a）：definition 存 SCG shortcut 定义串，引擎挂 SCG GatewayFilter';
COMMENT ON COLUMN gw_route_filter.id IS '主键（序列自增）';
COMMENT ON COLUMN gw_route_filter.route_id IS '所属路由 gw_route.id';
COMMENT ON COLUMN gw_route_filter.definition IS 'SCG 原生 shortcut 定义串，如 AddRequestHeader=X-Foo, bar / RewritePath=/red/(?<segment>.*), /$\{segment}';
COMMENT ON COLUMN gw_route_filter.sort_order IS '排序号（同一路由内多条 filter 的挂载顺序，= SCG filters[] 声明顺序）';
COMMENT ON COLUMN gw_route_filter.is_deleted IS '逻辑删除位（0 未删除 / 1 已删除）';
COMMENT ON COLUMN gw_route_filter.created_at IS '创建时间';
COMMENT ON COLUMN gw_route_filter.updated_at IS '更新时间（set_updated_at() 触发器维护）';

COMMENT ON COLUMN gw_route.metadata IS '路由元数据（S12-7a）：SCG RouteDefinition.metadata 同形（JSON object），引擎透传给 SCG Route.metadata（可被 RouteLocator.matchMetadata 消费）';
