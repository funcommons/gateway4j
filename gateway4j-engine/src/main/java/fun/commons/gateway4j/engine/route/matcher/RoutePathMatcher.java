package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.util.RoutePathUtils;

import java.util.*;

public class RoutePathMatcher {

    private final List<RouteEntry> entries = new ArrayList<>();

    private record RouteEntry(Long routeId, String pattern, boolean doubleWildcard, boolean singleWildcard) {}

    public void addRoute(Long routeId, String path) {
        String normalized = RoutePathUtils.normalizePath(path);
        boolean doubleWildcard = normalized.endsWith("/**");
        boolean singleWildcard = !doubleWildcard && normalized.endsWith("/*");

        entries.add(new RouteEntry(routeId, normalized, doubleWildcard, singleWildcard));
    }

    public Optional<Long> match(String requestPath) {
        String normalized = RoutePathUtils.normalizePath(requestPath);

        Long exactMatch = null;
        Long wildcardMatch = null;

        for (RouteEntry entry : entries) {
            if (entry.doubleWildcard) {
                String prefix = entry.pattern.substring(0, entry.pattern.length() - 3);
                if (prefix.isEmpty() || normalized.equals(prefix) ||
                        (normalized.startsWith(prefix) && normalized.charAt(prefix.length()) == '/')) {
                    if (wildcardMatch == null) {
                        wildcardMatch = entry.routeId;
                    }
                }
            } else if (entry.singleWildcard) {
                String prefix = entry.pattern.substring(0, entry.pattern.length() - 2);
                if (prefix.isEmpty()) {
                    if (!normalized.substring(1).contains("/")) {
                        if (wildcardMatch == null) {
                            wildcardMatch = entry.routeId;
                        }
                    }
                } else if (normalized.startsWith(prefix + "/")) {
                    String remaining = normalized.substring(prefix.length() + 1);
                    if (!remaining.contains("/")) {
                        if (wildcardMatch == null) {
                            wildcardMatch = entry.routeId;
                        }
                    }
                }
            } else {
                if (normalized.equals(entry.pattern)) {
                    exactMatch = entry.routeId;
                }
            }
        }

        return Optional.ofNullable(exactMatch != null ? exactMatch : wildcardMatch);
    }

    public void clear() {
        entries.clear();
    }

    public int size() {
        return entries.size();
    }
}
