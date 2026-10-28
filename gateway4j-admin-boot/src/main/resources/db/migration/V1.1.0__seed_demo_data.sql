-- ============================================================================
-- V1.1.0__seed_demo_data.sql
-- 示例路由 + admin 用户 + 权限分配
-- ============================================================================

-- 1. admin 用户 (bcrypt hash for 'admin123')
-- Guard: only insert if no active admin exists (partial unique index prevents ON CONFLICT)
INSERT INTO gw_user (id, username, password, real_name, status)
SELECT 1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJ0dEOI9fii', '管理员', 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM gw_user WHERE username = 'admin' AND is_deleted = 0);

-- 2. admin → ROLE_ADMIN  (use actual user id)
INSERT INTO gw_user_role_rel (user_id, role_code)
SELECT id, 'ROLE_ADMIN' FROM gw_user WHERE username = 'admin' AND is_deleted = 0
ON CONFLICT DO NOTHING;

-- 3. ROLE_ADMIN → all permissions
INSERT INTO gw_role_permission_rel (role_code, permission_code)
SELECT 'ROLE_ADMIN', permission_code FROM gw_permission
ON CONFLICT DO NOTHING;

-- 4. 示例路由
-- 4.1 顶级分发路由：API 网关入口
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -100, 'api_gateway', 'DISPATCH', '/api/**', NULL, 'PUBLISHED', NULL, 1,
  'API 网关总入口，按路径前缀分发到各微服务'
) ON CONFLICT (id) DO NOTHING;

-- 4.2 后置路由：用户服务
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -101, 'user_service', 'BACKEND', '/api/user/**', 'http://localhost:8081', 'PUBLISHED', -100, 1,
  '用户中心微服务'
) ON CONFLICT (id) DO NOTHING;

-- 4.3 后置路由：订单服务
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -102, 'order_service', 'BACKEND', '/api/order/**', 'http://localhost:8082', 'PUBLISHED', -100, 2,
  '订单微服务'
) ON CONFLICT (id) DO NOTHING;

-- 4.4 后置路由：商品服务
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -103, 'product_service', 'BACKEND', '/api/product/**', 'http://localhost:8083', 'PUBLISHED', -100, 3,
  '商品微服务'
) ON CONFLICT (id) DO NOTHING;

-- 4.5 草稿路由：支付服务（未发布）
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -104, 'payment_service', 'BACKEND', '/api/pay/**', 'http://localhost:8084', 'DRAFT', -100, 4,
  '支付微服务（开发中）'
) ON CONFLICT (id) DO NOTHING;

-- 4.6 独立后置路由：静态资源
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -105, 'static_assets', 'BACKEND', '/static/**', 'http://localhost:3000', 'PUBLISHED', NULL, 10,
  '静态资源代理'
) ON CONFLICT (id) DO NOTHING;

-- 4.7 二级分发路由：内部 API
INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status, parent_route_id, sort_order, remark)
VALUES (
  -106, 'internal_api', 'DISPATCH', '/internal/**', NULL, 'DRAFT', NULL, 20,
  '内部 API 分发（开发中）'
) ON CONFLICT (id) DO NOTHING;

-- 5. 分发条件 (idempotent: delete old + re-insert)
DELETE FROM gw_route_condition WHERE route_id = -100;
INSERT INTO gw_route_condition (route_id, target_route_id, condition_type, operator, condition_key, condition_value, priority)
VALUES
  (-100, -101, 'PATH', 'CONTAINS', '/api/user', '/api/user', 1),
  (-100, -102, 'PATH', 'CONTAINS', '/api/order', '/api/order', 2),
  (-100, -103, 'PATH', 'CONTAINS', '/api/product', '/api/product', 3),
  (-100, -104, 'PATH', 'CONTAINS', '/api/pay', '/api/pay', 4);

-- 6. 路由-插件绑定 (idempotent: delete old + re-insert)
DELETE FROM gw_route_plugin_binding WHERE route_id IN (-101, -102) AND is_deleted = 0;
INSERT INTO gw_route_plugin_binding (route_id, plugin_id, sort_order, binding_config)
VALUES
  (-101, -3, 1, '{"max_requests": 100, "window_seconds": 60}'::jsonb),
  (-102, -5, 1, '{}'::jsonb);

-- 7. 启用部分内置插件
UPDATE gw_plugin SET status = 'ENABLED' WHERE plugin_id IN ('logging', 'logging-post', 'tracing', 'tracing-post');
