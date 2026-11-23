package fun.commons.gateway4j.common.util;

import java.util.ArrayList;
import java.util.List;

public final class RoutePathUtils {

    private RoutePathUtils() {}

    /**
     * 路由 path 归一（配置侧）：补前导 "/"、剥掉尾部 "/"。
     *
     * <p>注意：这是<b>配置侧</b>归一，用于 route path 落库展示与 pattern 编译前的整形，
     * <b>不是</b>请求路径的匹配用归一（请求侧见 {@link #normalizeRequestPath}）。</p>
     */
    public static String normalizePath(String path) {
        if (path == null || path.isEmpty()) {
            return "/";
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }

    /**
     * 请求 path 匹配用归一（S12-2）：只保证前导 "/"，<b>不剥离尾斜杠</b>。
     *
     * <p>与 Spring Cloud Gateway 默认口径一致：{@code PathRoutePredicateFactory.Config
     * .matchTrailingSlash} 默认 {@code true}，即 pattern {@code /api} 命中 request
     * {@code /api/}。请求侧若在此处剥掉尾斜杠，三层（SCG 注册层 / 分发层 / 模拟器）
     * 的尾斜杠判定就会分裂。</p>
     */
    public static String normalizeRequestPath(String path) {
        if (path == null || path.isEmpty()) {
            return "/";
        }
        return path.startsWith("/") ? path : "/" + path;
    }

    public static List<String> extractPathSegments(String path) {
        String normalized = normalizePath(path);
        List<String> segments = new ArrayList<>();
        if ("/".equals(normalized)) {
            return segments;
        }
        String[] parts = normalized.split("/");
        for (String part : parts) {
            if (!part.isEmpty()) {
                segments.add(part);
            }
        }
        return segments;
    }
}
