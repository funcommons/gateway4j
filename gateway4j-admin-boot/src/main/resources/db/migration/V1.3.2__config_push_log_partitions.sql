-- ============================================================================
-- V1.3.2__config_push_log_partitions.sql
-- gw_config_push_log 按月分区续期：V1.0.0 仅建了 2026_07/2026_08 两个分区，
-- 管理面配置变更通知（Redis 广播）落推送审计时，2026-09 起会因无匹配分区报错。
-- 补 2026_09 ~ 2026_12 四个月度分区，并加 DEFAULT 分区兜底后续未及建分区的时间段。
-- 注意：V1.0.0 分区边界已固化为 UTC（+00），这里必须写显式 +00 偏移，
-- 否则迁移在 UTC+8 会话下执行时字面量前移 8 小时，与 2026_08 分区重叠报错。
-- ============================================================================

CREATE TABLE gw_config_push_log_2026_09 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE gw_config_push_log_2026_10 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE gw_config_push_log_2026_11 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE gw_config_push_log_2026_12 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- 兜底分区：超过已建月度分区范围的审计行落这里，避免写入直接报错；
-- 后续仍应按月新建分区（default 为空时 CREATE TABLE ... PARTITION OF 可正常执行）。
CREATE TABLE gw_config_push_log_default PARTITION OF gw_config_push_log DEFAULT;

COMMENT ON TABLE gw_config_push_log_2026_09 IS '配置推送日志 2026-09 分区';
COMMENT ON TABLE gw_config_push_log_2026_10 IS '配置推送日志 2026-10 分区';
COMMENT ON TABLE gw_config_push_log_2026_11 IS '配置推送日志 2026-11 分区';
COMMENT ON TABLE gw_config_push_log_2026_12 IS '配置推送日志 2026-12 分区';
COMMENT ON TABLE gw_config_push_log_default IS '配置推送日志兜底分区';
