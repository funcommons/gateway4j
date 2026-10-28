package fun.commons.gateway4j.engine.route.validator;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.RouteCondition;

import java.util.*;

public class RouteValidator {

    public void validateCyclicReference(Long routeId, Map<Long, List<RouteCondition>> conditionMap) {
        Set<Long> visited = new HashSet<>();
        Set<Long> recursionStack = new HashSet<>();
        dfs(routeId, conditionMap, visited, recursionStack, new ArrayList<>());
    }

    public void validateDepth(Long routeId, Map<Long, List<RouteCondition>> conditionMap) {
        checkDepth(routeId, conditionMap, 1, new HashSet<>());
    }

    private void dfs(Long currentId, Map<Long, List<RouteCondition>> conditionMap,
                     Set<Long> visited, Set<Long> recursionStack, List<Long> path) {
        visited.add(currentId);
        recursionStack.add(currentId);
        path.add(currentId);

        List<RouteCondition> conditions = conditionMap.getOrDefault(currentId, List.of());
        for (RouteCondition condition : conditions) {
            Long targetId = condition.getTargetRouteId();
            if (recursionStack.contains(targetId)) {
                path.add(targetId);
                throw new CyclicReferenceException(buildPathString(path));
            }
            if (!visited.contains(targetId)) {
                dfs(targetId, conditionMap, visited, recursionStack, new ArrayList<>(path));
            }
        }

        recursionStack.remove(currentId);
    }

    private void checkDepth(Long currentId, Map<Long, List<RouteCondition>> conditionMap,
                            int depth, Set<Long> visited) {
        if (depth > GatewayConstants.MAX_DISPATCH_DEPTH) {
            throw new DepthExceededException(depth);
        }
        if (visited.contains(currentId)) {
            return;
        }
        visited.add(currentId);

        List<RouteCondition> conditions = conditionMap.getOrDefault(currentId, List.of());
        for (RouteCondition condition : conditions) {
            checkDepth(condition.getTargetRouteId(), conditionMap, depth + 1, new HashSet<>(visited));
        }
    }

    private String buildPathString(List<Long> path) {
        StringBuilder sb = new StringBuilder();
        for (Long id : path) {
            if (!sb.isEmpty()) sb.append(" -> ");
            sb.append(id);
        }
        return sb.toString();
    }
}
