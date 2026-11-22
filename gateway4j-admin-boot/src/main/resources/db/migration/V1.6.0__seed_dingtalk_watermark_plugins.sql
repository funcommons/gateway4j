-- ============================================================================
-- V1.6.0__seed_dingtalk_watermark_plugins.sql
-- 钉钉登录 / HTML 安全水印两内置插件的落库种子（S11-1 / S11-2 补强收官配套）：
--   - dingtalk（PRE）：钉钉 SSO OAuth2 登录，state CSRF 校验 + 会话 JWT 注入 X-User 头；
--   - watermark（POST）：HTML 响应注入水印 JS（</body> 前），stripCsp=true 时按需剥离 CSP 头。
-- 两行默认 status=DISABLED：插件链按 gw_plugin 行驱动（GLOBAL + ENABLED 才会被网关
-- 装配为运行时实例），种子只建行占位，启用与配置由管理员在插件管理 UI 操作。
-- config='{}' 空模板：缺省值由插件 Config 类兜底（如 stateTimeout=300、tokenTimeout=43200、
-- sessionCookieName=fu-gw-token、stripCsp=false）；正式启用前应至少补齐 corpId/appKey/
-- appSecret（钉钉）与 org（水印）。config 列含敏感键（appSecret/stateSecret/jwtSecret），
-- 走 [ENCRYPT: AES-256-GCM] 加密存储。
-- 幂等：uk_plugin_id / uk_plugin_name 均为 is_deleted=0 上的部分唯一索引，
-- ON CONFLICT DO NOTHING 保证重复应用（或手工已建行）时不报错。
-- id 使用负数占位（-20/-21，避开 V1.0.0 内置种子 -1~-10），实际运行时由
-- SnowflakeDistributor 生成；sort_order=900 为名义值（DISABLED 行不参与执行排序）。
-- ============================================================================

INSERT INTO gw_plugin (id, plugin_name, plugin_id, plugin_type, plugin_phase, scope, status, sort_order, config, remark)
VALUES
    (-20, '钉钉认证插件', 'dingtalk', 'BUILTIN', 'PRE', 'GLOBAL', 'DISABLED', 900,
     '{}'::jsonb, '内置种子：钉钉 SSO 登录，默认禁用，启用+配置由插件管理 UI 操作（V1.6.0）'),
    (-21, '安全水印插件', 'watermark', 'BUILTIN', 'POST', 'GLOBAL', 'DISABLED', 900,
     '{}'::jsonb, '内置种子：HTML 水印注入，默认禁用，启用+配置由插件管理 UI 操作（V1.6.0）')
ON CONFLICT (plugin_id) WHERE is_deleted = 0 DO NOTHING;
