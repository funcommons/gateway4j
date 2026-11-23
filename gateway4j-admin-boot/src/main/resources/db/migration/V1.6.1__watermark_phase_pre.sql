-- ============================================================================
-- V1.6.1__watermark_phase_pre.sql
-- 水印插件执行阶段架构错配修正（S11-4c）：gw_plugin.plugin_phase 'POST' → 'PRE'。
--
-- 缺陷机理（真实流量实测）：PluginExecutionFilter 的 POST 链挂在
-- chain.filter(exchange).then(POST 链)，于转发完成后执行——上游响应已由 SCG 用
-- 原始 response 写回客户端，水印的 response decorator（writeWith 包装）mutate
-- 太晚天然失效：execute 被调 + config 正常但响应零注入。
--
-- 修法（方案 A：PRE 阶段末尾装饰）：水印改为 PRE 阶段 order=900（sort_order 本就是
-- 900 不动）——钉钉(2)/security 等短路类先跑，未登录已被 302 短路轮不到水印；放行
-- 请求先被 WatermarkDecorator 包装再转发，注入生效。同款修正在代码侧同步：
-- WatermarkPlugin 构造器（"PRE", 900）与 BuiltinPluginTypeRegistry 注册项。
-- ModifyResponse/CryptorResponse 的同款 POST decorator 错配为独立票，不在本迁移范围。
--
-- 为何新增迁移而非改 V1.6.0：V1.6.0 已在存量环境（含回归 pg-17 库）应用，就地编辑
-- 会破坏 Flyway checksum 校验（照 V1.3.4/V1.5.2 前例 fix-forward）。新库按序执行
-- V1.6.0（插 POST 行）→ V1.6.1（订正 PRE），存量库直接由本迁移订正；
-- WHERE 双条件保证重复执行/已订正库均为零行 no-op。
-- ============================================================================

UPDATE gw_plugin
SET plugin_phase = 'PRE'
WHERE plugin_id = 'watermark'
  AND plugin_phase = 'POST';
