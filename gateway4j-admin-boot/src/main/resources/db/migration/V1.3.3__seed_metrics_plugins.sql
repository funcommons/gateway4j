-- ============================================================================
-- V1.3.3__seed_metrics_plugins.sql
-- 内置指标插件种子数据：插件链按 gw_plugin 行驱动（GLOBAL + ENABLED 才会被
-- 网关装配为运行时实例），没有这两行时 MetricsPlugin / MetricsPostPlugin 永远
-- 不参与执行，监控大盘的 total_requests / error_count / latency 恒为 0。
-- metrics（PRE）记录请求总数；metrics-post（POST）只有它能观测到真实响应状态
-- 与转发失败标记，latency / errors 只在后置实例记录。
-- 幂等：uk_plugin_id / uk_plugin_name 均为 is_deleted=0 上的部分唯一索引，
-- ON CONFLICT DO NOTHING 保证重复应用（或手工已建行）时不报错。
-- ============================================================================

INSERT INTO gw_plugin (id, plugin_name, plugin_id, plugin_type, plugin_phase, scope, status, sort_order, config, remark)
VALUES
    (202610280001, '指标采集插件', 'metrics', 'BUILTIN', 'PRE', 'GLOBAL', 'ENABLED', 990,
     '{"enabled": true, "metricsPrefix": "gateway4j"}', '内置种子：大盘请求总数来源（V1.3.3）'),
    (202610280002, '指标采集插件（后置）', 'metrics-post', 'BUILTIN', 'POST', 'GLOBAL', 'ENABLED', 991,
     '{"enabled": true, "metricsPrefix": "gateway4j"}', '内置种子：大盘延迟与错误数来源（V1.3.3）')
ON CONFLICT (plugin_id) WHERE is_deleted = 0 DO NOTHING;
