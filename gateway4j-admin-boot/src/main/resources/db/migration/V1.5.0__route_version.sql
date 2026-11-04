-- ============================================================================
-- V1.5.0__route_version.sql
-- 路由版本快照（gw_route_version）：发布/下线/修改事务内落一行 JSONB 配置快照，
-- 供版本时间线与两版本逐字段 diff（契约 §4 S5a，docs/ui-v2/实施契约.md）
--
-- 设计口径：
--   * 快照行在发布/下线/修改的同一事务内写入，写失败抛业务异常使主事务回滚
--     （「配置写失败阻断发布」）；无外键，route_id 一致性由应用层保证；
--   * UNIQUE(route_id, config_version, change_type)：PUBLISH/OFFLINE 每次推进
--     config_version 天然不冲突；UPDATE 不推进版本，同版本多次修改由
--     RouteVersionService 按「先删后插」替换语义保证同版本仅保留最新一次
--     UPDATE 快照；三类行可同 (route_id, config_version) 共存——下线后修改
--     产生 OFFLINE@N 与 UPDATE@N 并存属正常态，diff 取数由 RouteVersionService
--     决定论择优（非 UPDATE 行优先，同类取 id 最大）；
--   * published_at 兼作该行 created_at（快照行生成即版本时点，日志表不再另设）。
-- ============================================================================

CREATE TABLE gw_route_version (
    id                 BIGSERIAL,
    route_id           BIGINT       NOT NULL,
    config_version     BIGINT       NOT NULL,
    change_type        VARCHAR(30),
    snapshot_data      JSONB        NOT NULL,
    change_description VARCHAR(500),
    actor              VARCHAR(64),
    published_at       TIMESTAMPTZ  DEFAULT now(),
    PRIMARY KEY (id)
);

-- UNIQUE 含 change_type 维度：同 (route_id, config_version) 下 PUBLISH/OFFLINE
-- 与 UPDATE 可并存（下线后修改），仅同类型替换才触发唯一约束
CREATE UNIQUE INDEX uk_route_version_route_id_config_version_change_type
    ON gw_route_version (route_id, config_version, change_type);

COMMENT ON TABLE gw_route_version IS '路由版本快照（发布/下线/修改事务内写入）';
COMMENT ON COLUMN gw_route_version.id IS '主键';
COMMENT ON COLUMN gw_route_version.route_id IS '路由 ID（gw_route.id，应用层保证一致性，无外键）';
COMMENT ON COLUMN gw_route_version.config_version IS '快照时的路由配置版本号（gw_route.config_version，BIGINT 对齐源列）';
COMMENT ON COLUMN gw_route_version.change_type IS '变更类型：PUBLISH=发布 OFFLINE=下线 UPDATE=修改';
COMMENT ON COLUMN gw_route_version.snapshot_data IS '路由配置快照 JSON（route_name/route_type/path/upstream_url/status/sort_order/remark/tags）';
COMMENT ON COLUMN gw_route_version.change_description IS '变更说明（发布请求 change_description 透传，可空）';
COMMENT ON COLUMN gw_route_version.actor IS '操作人（登录名；系统内部调用为 system，可空）';
COMMENT ON COLUMN gw_route_version.published_at IS '快照时间（now() 缺省，兼作 created_at）';
