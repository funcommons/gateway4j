package fun.commons.gateway4j.admin.service;

import java.util.List;

/**
 * 路由导入导出包结构（自包含，无雪花 ID，引用用 route_name / plugin_id）。
 *
 * <p>P2-2 多环境：顶层 {@code environment} 为导出指纹——导出路由同属一个环境时
 * 为该环境标识，混合环境导出为 {@code mixed}。旧包（无该字段）经 Jackson 反序列化
 * 得 null，导入/预检按 {@code default} 处理，完全向后兼容。</p>
 */
public record RoutePackage(
        String version,
        Long exportedAt,
        List<RouteNode> routes,
        /** 导出环境指纹：单一环境为其标识，混合导出为 "mixed"；旧包为 null（= default）。 */
        String environment
) {
    /** 旧三参构造（存量调用方/旧包语义）：environment=null，导入侧按 default 处理。 */
    public RoutePackage(String version, Long exportedAt, List<RouteNode> routes) {
        this(version, exportedAt, routes, null);
    }

    public record RouteNode(
            String routeName,
            String routeType,
            String path,
            String upstreamUrl,
            Integer sortOrder,
            String remark,
            List<ConditionNode> conditions,
            List<PluginNode> plugins,
            List<RouteNode> children
    ) {}

    public record ConditionNode(
            String conditionType,
            String operator,
            String conditionKey,
            String conditionValue,
            String targetRouteKey,
            Integer priority
    ) {}

    public record PluginNode(
            String pluginId,
            String bindingConfig,
            Integer sortOrder
    ) {}
}
