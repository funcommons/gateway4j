-- ============================================================================
-- V1.5.1__deprecate_plugin_global_permission.sql
-- 废弃 plugin:global 权限码（UI v2 拆旧清理票 P4f-D）：
-- 前端 listGlobalPlugins 调用已随旧视图树删除（commit 7852829），
-- /v1/plugins/global 端点后端仅 @RequiresToken("BEARER")、无权限码强引用，
-- 该权限码失去消费方，随拆旧废弃。
-- ============================================================================

-- 1. 清理角色授权关联（关联表无物理外键，先删关联再删字典，防悬挂引用；
--    V1.1.0 曾将全量权限授予 ROLE_ADMIN，此处一并回收）
DELETE FROM gw_role_permission_rel WHERE permission_code = 'plugin:global';

-- 2. 删除权限码本身（V1.0.0 种子行，sort_order=7 留空洞不回填，排序值允许间隙）
DELETE FROM gw_permission WHERE permission_code = 'plugin:global';
