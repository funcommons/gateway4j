package fun.commons.gateway4j.engine.route.dispatcher;

import java.util.List;

public record ResolvedRoute(
        Long routeId,
        String upstreamUrl,
        String matchedPath,
        List<Long> dispatchPath
) {}
