package fun.commons.gateway4j.common.util;

import java.util.ArrayList;
import java.util.List;

public final class RoutePathUtils {

    private RoutePathUtils() {}

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

    public static boolean matchPath(String pattern, String path) {
        if (pattern == null || path == null) {
            return false;
        }
        String normalizedPattern = normalizePath(pattern);
        String normalizedPath = normalizePath(path);

        if (normalizedPattern.equals(normalizedPath)) {
            return true;
        }

        if (normalizedPattern.endsWith("/**")) {
            String prefix = normalizedPattern.substring(0, normalizedPattern.length() - 3);
            if (prefix.isEmpty()) {
                return true;
            }
            return normalizedPath.startsWith(prefix) &&
                    (normalizedPath.length() == prefix.length() || normalizedPath.charAt(prefix.length()) == '/');
        }

        if (normalizedPattern.endsWith("/*")) {
            String prefix = normalizedPattern.substring(0, normalizedPattern.length() - 2);
            if (prefix.isEmpty()) {
                return !normalizedPath.substring(1).contains("/");
            }
            if (!normalizedPath.startsWith(prefix + "/")) {
                return false;
            }
            String remaining = normalizedPath.substring(prefix.length() + 1);
            return !remaining.contains("/");
        }

        return false;
    }
}
