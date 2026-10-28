-- ============================================================================
-- V1.0.0__init_schema.sql
-- 可视化网关（gateway4j）初始数据库脚本
-- PostgreSQL 16+
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 通用触发器函数：updated_at 自动更新
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. gw_route - 路由配置（事务表）
-- ============================================================================

CREATE TABLE gw_route (
    id              BIGINT       NOT NULL,
    route_name      VARCHAR(50)  NOT NULL,
    route_type      VARCHAR(20)  NOT NULL,
    path            VARCHAR(500) DEFAULT NULL,
    upstream_url    VARCHAR(500) DEFAULT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
    parent_route_id BIGINT       DEFAULT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    remark          VARCHAR(200) DEFAULT NULL,
    config_version  BIGINT       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_route_name ON gw_route (route_name) WHERE is_deleted = 0;
CREATE INDEX idx_route_type ON gw_route (route_type);
CREATE INDEX idx_route_status ON gw_route (status);
CREATE INDEX idx_parent_route ON gw_route (parent_route_id);

CREATE TRIGGER trg_gw_route_updated_at
    BEFORE UPDATE ON gw_route
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_route IS '路由配置';
COMMENT ON COLUMN gw_route.id IS '主键（雪花ID）';
COMMENT ON COLUMN gw_route.route_name IS '路由名称';
COMMENT ON COLUMN gw_route.route_type IS '路由类型：DISPATCH/BACKEND';
COMMENT ON COLUMN gw_route.path IS '匹配路径（后置路由必填）';
COMMENT ON COLUMN gw_route.upstream_url IS '后端服务地址（后置路由必填）';
COMMENT ON COLUMN gw_route.status IS '状态：DRAFT/PUBLISHED/OFFLINE/CHANGING';
COMMENT ON COLUMN gw_route.parent_route_id IS '父路由ID（分发路由嵌套时使用）';
COMMENT ON COLUMN gw_route.sort_order IS '排序值（同一父路由下排序）';
COMMENT ON COLUMN gw_route.remark IS '备注';
COMMENT ON COLUMN gw_route.config_version IS '配置版本号（单调递增）';
COMMENT ON COLUMN gw_route.created_at IS '创建时间';
COMMENT ON COLUMN gw_route.updated_at IS '更新时间';
COMMENT ON COLUMN gw_route.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 2. gw_route_condition - 分发条件（关系表）
-- ============================================================================

CREATE TABLE gw_route_condition (
    id               BIGSERIAL,
    route_id         BIGINT       NOT NULL,
    target_route_id  BIGINT       NOT NULL,
    condition_type   VARCHAR(20)  NOT NULL,
    operator         VARCHAR(20)  NOT NULL,
    condition_key    VARCHAR(200) DEFAULT NULL,
    condition_value  VARCHAR(500) DEFAULT NULL,
    priority         INT          NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE INDEX idx_condition_route ON gw_route_condition (route_id);
CREATE INDEX idx_condition_target ON gw_route_condition (target_route_id);
CREATE INDEX idx_condition_route_priority ON gw_route_condition (route_id, priority);

COMMENT ON TABLE gw_route_condition IS '分发条件';
COMMENT ON COLUMN gw_route_condition.id IS '主键';
COMMENT ON COLUMN gw_route_condition.route_id IS '所属分发路由ID';
COMMENT ON COLUMN gw_route_condition.target_route_id IS '目标路由ID';
COMMENT ON COLUMN gw_route_condition.condition_type IS '条件类型：HEADER/PATH/QUERY/BODY/GROOVY';
COMMENT ON COLUMN gw_route_condition.operator IS '比较运算符：EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT';
COMMENT ON COLUMN gw_route_condition.condition_key IS '条件键（如Header名、参数名）';
COMMENT ON COLUMN gw_route_condition.condition_value IS '条件值（如期望值、正则表达式）';
COMMENT ON COLUMN gw_route_condition.priority IS '优先级（数值越小越先匹配）';
COMMENT ON COLUMN gw_route_condition.created_at IS '创建时间';

-- ============================================================================
-- 3. gw_plugin - 插件（实体表）
-- ============================================================================

CREATE TABLE gw_plugin (
    id             BIGINT       NOT NULL,
    plugin_name    VARCHAR(50)  NOT NULL,
    plugin_id      VARCHAR(50)  NOT NULL,
    plugin_type    VARCHAR(20)  NOT NULL,
    plugin_phase   VARCHAR(20)  NOT NULL,
    scope          VARCHAR(20)  NOT NULL DEFAULT 'ROUTE',
    status         VARCHAR(20)  NOT NULL DEFAULT 'DISABLED',
    sort_order     INT          NOT NULL DEFAULT 0,
    config         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    remark         VARCHAR(200) DEFAULT NULL,
    config_version BIGINT       NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_plugin_name ON gw_plugin (plugin_name) WHERE is_deleted = 0;
CREATE UNIQUE INDEX uk_plugin_id ON gw_plugin (plugin_id) WHERE is_deleted = 0;
CREATE INDEX idx_plugin_type ON gw_plugin (plugin_type);
CREATE INDEX idx_plugin_scope_phase ON gw_plugin (scope, plugin_phase, sort_order);
CREATE INDEX idx_plugin_config ON gw_plugin USING GIN (config);

CREATE TRIGGER trg_gw_plugin_updated_at
    BEFORE UPDATE ON gw_plugin
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_plugin IS '插件';
COMMENT ON COLUMN gw_plugin.id IS '主键（雪花ID）';
COMMENT ON COLUMN gw_plugin.plugin_name IS '插件名称';
COMMENT ON COLUMN gw_plugin.plugin_id IS '插件唯一标识';
COMMENT ON COLUMN gw_plugin.plugin_type IS '插件类型：BUILTIN/JAR/GROOVY/GROUP';
COMMENT ON COLUMN gw_plugin.plugin_phase IS '执行阶段：PRE/POST';
COMMENT ON COLUMN gw_plugin.scope IS '作用范围：GLOBAL/ROUTE';
COMMENT ON COLUMN gw_plugin.status IS '状态：ENABLED/DISABLED/UNINSTALLED';
COMMENT ON COLUMN gw_plugin.sort_order IS '排序值（同阶段内执行顺序）';
COMMENT ON COLUMN gw_plugin.config IS '插件配置参数（JSONB）[ENCRYPT: AES-256-GCM]';
COMMENT ON COLUMN gw_plugin.remark IS '备注';
COMMENT ON COLUMN gw_plugin.config_version IS '配置版本号（单调递增）';
COMMENT ON COLUMN gw_plugin.created_at IS '创建时间';
COMMENT ON COLUMN gw_plugin.updated_at IS '更新时间';
COMMENT ON COLUMN gw_plugin.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 4. gw_plugin_jar - JAR 插件（扩展表）
-- ============================================================================

CREATE TABLE gw_plugin_jar (
    id          BIGSERIAL,
    plugin_id   BIGINT       NOT NULL,
    jar_path    VARCHAR(500) NOT NULL,
    jar_md5     VARCHAR(32)  NOT NULL,
    main_class  VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted  SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_plugin_jar_plugin_id ON gw_plugin_jar (plugin_id) WHERE is_deleted = 0;

CREATE TRIGGER trg_gw_plugin_jar_updated_at
    BEFORE UPDATE ON gw_plugin_jar
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_plugin_jar IS 'JAR 插件';
COMMENT ON COLUMN gw_plugin_jar.id IS '主键';
COMMENT ON COLUMN gw_plugin_jar.plugin_id IS '关联插件ID';
COMMENT ON COLUMN gw_plugin_jar.jar_path IS 'JAR文件存储路径';
COMMENT ON COLUMN gw_plugin_jar.jar_md5 IS 'JAR文件MD5校验值';
COMMENT ON COLUMN gw_plugin_jar.main_class IS '插件主类全限定名';
COMMENT ON COLUMN gw_plugin_jar.created_at IS '创建时间';
COMMENT ON COLUMN gw_plugin_jar.updated_at IS '更新时间';
COMMENT ON COLUMN gw_plugin_jar.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 5. gw_plugin_groovy - Groovy 插件（扩展表）
-- ============================================================================

CREATE TABLE gw_plugin_groovy (
    id             BIGSERIAL,
    plugin_id      BIGINT      NOT NULL,
    script_content TEXT        NOT NULL,
    script_md5     VARCHAR(32) NOT NULL,
    compile_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    compile_error  TEXT        DEFAULT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     SMALLINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_plugin_groovy_plugin_id ON gw_plugin_groovy (plugin_id) WHERE is_deleted = 0;

CREATE TRIGGER trg_gw_plugin_groovy_updated_at
    BEFORE UPDATE ON gw_plugin_groovy
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_plugin_groovy IS 'Groovy 插件';
COMMENT ON COLUMN gw_plugin_groovy.id IS '主键';
COMMENT ON COLUMN gw_plugin_groovy.plugin_id IS '关联插件ID';
COMMENT ON COLUMN gw_plugin_groovy.script_content IS 'Groovy脚本内容';
COMMENT ON COLUMN gw_plugin_groovy.script_md5 IS '脚本MD5校验值';
COMMENT ON COLUMN gw_plugin_groovy.compile_status IS '编译状态：PENDING/SUCCESS/FAILED';
COMMENT ON COLUMN gw_plugin_groovy.compile_error IS '编译错误信息';
COMMENT ON COLUMN gw_plugin_groovy.created_at IS '创建时间';
COMMENT ON COLUMN gw_plugin_groovy.updated_at IS '更新时间';
COMMENT ON COLUMN gw_plugin_groovy.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 6. gw_plugin_group_item - 分组插件项（关系表）
-- ============================================================================

CREATE TABLE gw_plugin_group_item (
    id               BIGSERIAL,
    group_plugin_id  BIGINT NOT NULL,
    member_plugin_id BIGINT NOT NULL,
    sort_order       INT    NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (group_plugin_id, member_plugin_id)
);

CREATE INDEX idx_group_plugin ON gw_plugin_group_item (group_plugin_id);

COMMENT ON TABLE gw_plugin_group_item IS '分组插件项';
COMMENT ON COLUMN gw_plugin_group_item.id IS '主键';
COMMENT ON COLUMN gw_plugin_group_item.group_plugin_id IS '分组插件ID';
COMMENT ON COLUMN gw_plugin_group_item.member_plugin_id IS '成员插件ID';
COMMENT ON COLUMN gw_plugin_group_item.sort_order IS '组内排序值';
COMMENT ON COLUMN gw_plugin_group_item.created_at IS '创建时间';

-- ============================================================================
-- 7. gw_route_plugin_binding - 路由-插件绑定（关系表）
-- ============================================================================

CREATE TABLE gw_route_plugin_binding (
    id             BIGSERIAL,
    route_id       BIGINT NOT NULL,
    plugin_id      BIGINT NOT NULL,
    sort_order     INT    NOT NULL DEFAULT 0,
    binding_config JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted     SMALLINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_binding_route_plugin ON gw_route_plugin_binding (route_id, plugin_id) WHERE is_deleted = 0;
CREATE INDEX idx_binding_route ON gw_route_plugin_binding (route_id);
CREATE INDEX idx_binding_config ON gw_route_plugin_binding USING GIN (binding_config);

CREATE TRIGGER trg_gw_route_plugin_binding_updated_at
    BEFORE UPDATE ON gw_route_plugin_binding
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_route_plugin_binding IS '路由-插件绑定';
COMMENT ON COLUMN gw_route_plugin_binding.id IS '主键';
COMMENT ON COLUMN gw_route_plugin_binding.route_id IS '路由ID';
COMMENT ON COLUMN gw_route_plugin_binding.plugin_id IS '插件ID';
COMMENT ON COLUMN gw_route_plugin_binding.sort_order IS '绑定排序值';
COMMENT ON COLUMN gw_route_plugin_binding.binding_config IS '路由级插件配置覆盖（JSONB）[ENCRYPT: AES-256-GCM]';
COMMENT ON COLUMN gw_route_plugin_binding.created_at IS '创建时间';
COMMENT ON COLUMN gw_route_plugin_binding.updated_at IS '更新时间';
COMMENT ON COLUMN gw_route_plugin_binding.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 8. gw_route_canvas - 路由画布数据（扩展表）
-- ============================================================================

CREATE TABLE gw_route_canvas (
    id          BIGSERIAL,
    route_id    BIGINT NOT NULL,
    canvas_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted  SMALLINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE (route_id)
);

CREATE INDEX idx_canvas_data ON gw_route_canvas USING GIN (canvas_data);

CREATE TRIGGER trg_gw_route_canvas_updated_at
    BEFORE UPDATE ON gw_route_canvas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_route_canvas IS '路由画布数据';
COMMENT ON COLUMN gw_route_canvas.id IS '主键';
COMMENT ON COLUMN gw_route_canvas.route_id IS '关联路由ID';
COMMENT ON COLUMN gw_route_canvas.canvas_data IS '画布节点与连线数据（JSONB）';
COMMENT ON COLUMN gw_route_canvas.created_at IS '创建时间';
COMMENT ON COLUMN gw_route_canvas.updated_at IS '更新时间';
COMMENT ON COLUMN gw_route_canvas.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 9. gw_config_push_log - 配置推送日志（日志表，按月分区）
-- ============================================================================

CREATE TABLE gw_config_push_log (
    id             BIGSERIAL,
    config_type    VARCHAR(20)  NOT NULL,
    config_id      BIGINT       NOT NULL,
    config_version BIGINT       NOT NULL,
    change_type    VARCHAR(20)  NOT NULL,
    instance_id    VARCHAR(50)  NOT NULL,
    push_status    VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    error_message  VARCHAR(500) DEFAULT NULL,
    retry_count    INT          NOT NULL DEFAULT 0,
    confirmed_at   TIMESTAMPTZ  DEFAULT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- updated_at 仅用于推送重试时更新 push_status，日志行本身不可变
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE gw_config_push_log_2026_07 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE gw_config_push_log_2026_08 PARTITION OF gw_config_push_log
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE INDEX idx_push_status ON gw_config_push_log (push_status, created_at);
CREATE INDEX idx_push_instance ON gw_config_push_log (instance_id, config_version);

CREATE TRIGGER trg_gw_config_push_log_updated_at
    BEFORE UPDATE ON gw_config_push_log
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_config_push_log IS '配置推送日志';
COMMENT ON COLUMN gw_config_push_log.id IS '主键';
COMMENT ON COLUMN gw_config_push_log.config_type IS '配置类型：ROUTE/PLUGIN/GLOBAL_PLUGIN';
COMMENT ON COLUMN gw_config_push_log.config_id IS '配置对象ID';
COMMENT ON COLUMN gw_config_push_log.config_version IS '配置版本号';
COMMENT ON COLUMN gw_config_push_log.change_type IS '变更类型：CREATE/UPDATE/DELETE/PUBLISH/OFFLINE';
COMMENT ON COLUMN gw_config_push_log.instance_id IS '目标网关实例ID';
COMMENT ON COLUMN gw_config_push_log.push_status IS '推送状态：PENDING/SUCCESS/FAILED';
COMMENT ON COLUMN gw_config_push_log.error_message IS '推送失败错误信息';
COMMENT ON COLUMN gw_config_push_log.retry_count IS '重试次数';
COMMENT ON COLUMN gw_config_push_log.confirmed_at IS '实例回执确认时间';
COMMENT ON COLUMN gw_config_push_log.created_at IS '创建时间';
COMMENT ON COLUMN gw_config_push_log.updated_at IS '更新时间';

-- ============================================================================
-- 10. gw_user - 用户（实体表）
-- ============================================================================

CREATE TABLE gw_user (
    id            BIGINT       NOT NULL,
    username      VARCHAR(50)  NOT NULL,
    password      VARCHAR(100) NOT NULL,
    real_name     VARCHAR(50)  DEFAULT NULL,
    phone         VARCHAR(20)  DEFAULT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'ENABLED',
    last_login_at TIMESTAMPTZ  DEFAULT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted    SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uk_username ON gw_user (username) WHERE is_deleted = 0;

CREATE TRIGGER trg_gw_user_updated_at
    BEFORE UPDATE ON gw_user
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_user IS '用户';
COMMENT ON COLUMN gw_user.id IS '主键（雪花ID）';
COMMENT ON COLUMN gw_user.username IS '用户名';
COMMENT ON COLUMN gw_user.password IS '密码 [ENCRYPT: bcrypt]';
COMMENT ON COLUMN gw_user.real_name IS '真实姓名 [MASK: *明]';
COMMENT ON COLUMN gw_user.phone IS '手机号 [MASK: 186****1234]';
COMMENT ON COLUMN gw_user.status IS '状态：ENABLED/DISABLED';
COMMENT ON COLUMN gw_user.last_login_at IS '最后登录时间';
COMMENT ON COLUMN gw_user.created_at IS '创建时间';
COMMENT ON COLUMN gw_user.updated_at IS '更新时间';
COMMENT ON COLUMN gw_user.is_deleted IS '逻辑删除 0=未删除 1=已删除';

-- ============================================================================
-- 11. gw_role - 角色（字典表）
-- ============================================================================

CREATE TABLE gw_role (
    id         BIGSERIAL,
    role_code  VARCHAR(50)  NOT NULL,
    role_name  VARCHAR(50)  NOT NULL,
    remark     VARCHAR(200) DEFAULT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (role_code)
);

CREATE TRIGGER trg_gw_role_updated_at
    BEFORE UPDATE ON gw_role
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_role IS '角色';
COMMENT ON COLUMN gw_role.id IS '主键';
COMMENT ON COLUMN gw_role.role_code IS '角色编码（业务主键，不可变）';
COMMENT ON COLUMN gw_role.role_name IS '角色名称';
COMMENT ON COLUMN gw_role.remark IS '备注';
COMMENT ON COLUMN gw_role.created_at IS '创建时间';
COMMENT ON COLUMN gw_role.updated_at IS '更新时间';

-- ============================================================================
-- 12. gw_user_role_rel - 用户角色关联（关系表）
-- ============================================================================

CREATE TABLE gw_user_role_rel (
    id         BIGSERIAL,
    user_id    BIGINT      NOT NULL,
    role_code  VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (user_id, role_code)
);

CREATE INDEX idx_user_role_code ON gw_user_role_rel (role_code);

COMMENT ON TABLE gw_user_role_rel IS '用户角色关联';
COMMENT ON COLUMN gw_user_role_rel.id IS '主键';
COMMENT ON COLUMN gw_user_role_rel.user_id IS '用户ID';
COMMENT ON COLUMN gw_user_role_rel.role_code IS '角色编码（引用 gw_role.role_code）';
COMMENT ON COLUMN gw_user_role_rel.created_at IS '创建时间';

-- ============================================================================
-- 13. gw_permission - 权限（字典表）
-- ============================================================================

CREATE TABLE gw_permission (
    id              BIGSERIAL,
    permission_code VARCHAR(100) NOT NULL,
    permission_name VARCHAR(50)  NOT NULL,
    resource_type   VARCHAR(20)  NOT NULL,
    parent_id       BIGINT       DEFAULT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (permission_code)
);

CREATE INDEX idx_permission_parent ON gw_permission (parent_id);

CREATE TRIGGER trg_gw_permission_updated_at
    BEFORE UPDATE ON gw_permission
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE gw_permission IS '权限';
COMMENT ON COLUMN gw_permission.id IS '主键';
COMMENT ON COLUMN gw_permission.permission_code IS '权限编码（业务主键，不可变）';
COMMENT ON COLUMN gw_permission.permission_name IS '权限名称';
COMMENT ON COLUMN gw_permission.resource_type IS '资源类型：MENU/BUTTON/API';
COMMENT ON COLUMN gw_permission.parent_id IS '父权限ID（树形结构）';
COMMENT ON COLUMN gw_permission.sort_order IS '排序值';
COMMENT ON COLUMN gw_permission.created_at IS '创建时间';
COMMENT ON COLUMN gw_permission.updated_at IS '更新时间';
COMMENT ON INDEX idx_permission_parent IS '按父权限ID查询子权限（树形结构遍历）';

-- ============================================================================
-- 14. gw_role_permission_rel - 角色权限关联（关系表）
-- ============================================================================

CREATE TABLE gw_role_permission_rel (
    id              BIGSERIAL,
    role_code       VARCHAR(50)  NOT NULL,
    permission_code VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (role_code, permission_code)
);

CREATE INDEX idx_role_perm_code ON gw_role_permission_rel (permission_code);

COMMENT ON TABLE gw_role_permission_rel IS '角色权限关联';
COMMENT ON COLUMN gw_role_permission_rel.id IS '主键';
COMMENT ON COLUMN gw_role_permission_rel.role_code IS '角色编码（引用 gw_role.role_code）';
COMMENT ON COLUMN gw_role_permission_rel.permission_code IS '权限编码（引用 gw_permission.permission_code）';
COMMENT ON COLUMN gw_role_permission_rel.created_at IS '创建时间';

-- ============================================================================
-- 初始数据
-- ============================================================================

-- 10.1 角色
INSERT INTO gw_role (role_code, role_name) VALUES
    ('ROLE_ADMIN', '超级管理员'),
    ('ROLE_OPS',   '网关运维'),
    ('ROLE_DEV',   '研发人员'),
    ('ROLE_GUEST', '访客');

-- 10.2 内置插件
-- 注意：id 使用负数占位，实际运行时由 SnowflakeDistributor 生成
-- 多阶段插件（cache/sharing/logging/tracing）注册 PRE + POST 两行
-- 所有内置插件默认 scope=GLOBAL
INSERT INTO gw_plugin (id, plugin_id, plugin_name, plugin_type, plugin_phase, scope, status, sort_order) VALUES
    (-1,  'security',      '安全插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 1),
    (-2,  'cache',         '缓存插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 2),
    (-3,  'rate-limiter',  '限流插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 3),
    (-4,  'sharing',       '共享插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 4),
    (-5,  'logging',       '日志插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 5),
    (-6,  'tracing',       '跟踪插件',         'BUILTIN', 'PRE',  'GLOBAL', 'DISABLED', 6),
    (-7,  'cache-post',    '缓存插件（后置）',  'BUILTIN', 'POST', 'GLOBAL', 'DISABLED', 2),
    (-8,  'sharing-post',  '共享插件（后置）',  'BUILTIN', 'POST', 'GLOBAL', 'DISABLED', 4),
    (-9,  'logging-post',  '日志插件（后置）',  'BUILTIN', 'POST', 'GLOBAL', 'DISABLED', 5),
    (-10, 'tracing-post',  '跟踪插件（后置）',  'BUILTIN', 'POST', 'GLOBAL', 'DISABLED', 6);

-- 10.3 权限
INSERT INTO gw_permission (permission_code, permission_name, resource_type, sort_order) VALUES
    ('route:read',       '查看路由',     'MENU',   1),
    ('route:edit',       '编辑路由',     'BUTTON', 2),
    ('route:publish',    '发布/下线路由', 'BUTTON', 3),
    ('route:delete',     '删除路由',     'BUTTON', 4),
    ('plugin:read',      '查看插件',     'MENU',   5),
    ('plugin:edit',      '编辑插件',     'BUTTON', 6),
    ('plugin:global',    '管理全局插件', 'BUTTON', 7),
    ('plugin:upload-jar','上传 JAR 插件','BUTTON', 8),
    ('monitor:read',     '查看监控大盘', 'MENU',   9),
    ('system:user',      '用户管理',     'MENU',   10),
    ('system:role',      '角色管理',     'MENU',   11);
