package fun.commons.gateway4j.common.constant;

public enum ErrorCode {

    ROUTE_NOT_FOUND(10601, "路由未找到"),
    /**
     * 乐观锁版本冲突（P1-5）：PATCH /v1/routes/{id} 携带的 expected_version 与当前
     * config_version 不一致。数值与 framework4j ApiCode.STATE_CONFLICT(10402) 对齐
     * （状态冲突语义即乐观锁冲突），message 覆盖为面向用户的可操作文案。
     */
    ROUTE_VERSION_CONFLICT(10402, "路由已被他人修改，请刷新后重试"),
    PLUGIN_NOT_FOUND(10608, "插件未找到"),
    PLUGIN_EXECUTION_FAILED(10602, "插件执行失败"),
    CYCLIC_REFERENCE(10603, "检测到循环引用"),
    DEPTH_EXCEEDED(10604, "分发路由嵌套深度超限"),
    CONFIG_SYNC_FAILED(10605, "配置同步失败"),
    PLUGIN_LOAD_FAILED(10606, "插件加载失败"),
    SERVICE_UNAVAILABLE(10607, "后端服务不可用"),
    ENGINE_INTERNAL_ERROR(10699, "网关引擎内部错误");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int code() {
        return code;
    }

    public String message() {
        return message;
    }

    public String codeStr() {
        return String.valueOf(code);
    }
}
