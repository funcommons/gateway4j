package fun.commons.gateway4j.admin.service;

import java.util.List;

/**
 * 路由导入导出包结构（自包含，无雪花 ID，引用用 route_name / plugin_id）。
 */
public record RoutePackage(
        String version,
        Long exportedAt,
        List<RouteNode> routes
) {
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
