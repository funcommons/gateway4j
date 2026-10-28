-- ============================================================================
-- V1.2.1__permission_codes.sql
-- 权限码词表补齐（修复 D5）：前端使用 user:read / user:edit / system:read /
-- system:edit / role:read / role:edit，gw_permission 中此前缺失；
-- 并修复"非 admin 角色空授权"（ROLE_OPS 仅绑定只读集）
-- ============================================================================

-- 1. 补充缺失的权限码（幂等：已存在则跳过）
INSERT INTO gw_permission (permission_code, permission_name, resource_type, sort_order)
SELECT v.permission_code, v.permission_name, v.resource_type, v.sort_order
FROM (VALUES
    ('user:read',   '用户查看', 'MENU',   12),
    ('user:edit',   '用户管理', 'BUTTON', 13),
    ('system:read', '系统查看', 'MENU',   14),
    ('system:edit', '系统设置', 'BUTTON', 15),
    ('role:read',   '角色查看', 'MENU',   16),
    ('role:edit',   '角色管理', 'BUTTON', 17)
) AS v(permission_code, permission_name, resource_type, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM gw_permission p WHERE p.permission_code = v.permission_code
);

-- 2. 全部授予 ROLE_ADMIN（幂等：WHERE NOT EXISTS 防重）
INSERT INTO gw_role_permission_rel (role_code, permission_code)
SELECT 'ROLE_ADMIN', v.permission_code
FROM (VALUES
    ('user:read'), ('user:edit'),
    ('system:read'), ('system:edit'),
    ('role:read'), ('role:edit')
) AS v(permission_code)
WHERE NOT EXISTS (
    SELECT 1 FROM gw_role_permission_rel r
    WHERE r.role_code = 'ROLE_ADMIN' AND r.permission_code = v.permission_code
);

-- 3. ROLE_OPS 只读授权（route/plugin/monitor/user/system/role 的 read）
INSERT INTO gw_role_permission_rel (role_code, permission_code)
SELECT 'ROLE_OPS', v.permission_code
FROM (VALUES
    ('route:read'), ('plugin:read'), ('monitor:read'),
    ('user:read'), ('system:read'), ('role:read')
) AS v(permission_code)
WHERE NOT EXISTS (
    SELECT 1 FROM gw_role_permission_rel r
    WHERE r.role_code = 'ROLE_OPS' AND r.permission_code = v.permission_code
);
