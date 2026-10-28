-- ============================================================================
-- V1.3.4__fix_admin_seed_password.sql
-- 修正 V1.1.0 种子的 admin 初始密码 hash：原 hash 为公共示例值（对应口令并非
-- admin123），全新库按种子初始化后 admin/admin123 永远登录失败。
-- 用 BCryptPasswordEncoder（$2a/$2y 同族）真实生成 admin123 的 hash 覆盖之。
-- 说明：不回改已应用的 V1.1.0（避免校验和不一致），全新库由本迁移二次纠正。
-- ============================================================================

UPDATE gw_user
SET password = '$2y$10$QU2Ak2ITzyVjcBiGBM7ks.R6iNZshmePa8e2TETpKjJ.XHBAZJ8ym'
WHERE username = 'admin' AND is_deleted = 0;
