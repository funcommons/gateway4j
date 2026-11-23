package fun.commons.gateway4j.engine.route.dispatcher;

import fun.commons.gateway4j.common.constant.ConditionType;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.random.RandomGenerator;
import java.util.stream.Collectors;

public class RouteDispatcher {

    private static final Logger log = LoggerFactory.getLogger(RouteDispatcher.class);

    private final RoutePathMatcher pathMatcher;
    private final RouteConditionMatcher conditionMatcher;
    private Map<Long, Route> routeMap = Map.of();
    private Map<Long, List<RouteCondition>> conditionMap = Map.of();

    /**
     * WEIGHT 流量分割的随机源，产出 [0,1) 的 double。
     * 生产默认 ThreadLocalRandom（线程安全、每线程独立）；单测可通过构造器或
     * {@link #setRandom(RandomGenerator)} 注入固定 seed 的 SplittableRandom/Random
     * 以确定性复现精确选择序列（注入线程不安全的源时须保证单线程调度）。
     */
    private volatile RandomGenerator random;

    public RouteDispatcher(RoutePathMatcher pathMatcher, RouteConditionMatcher conditionMatcher) {
        this(pathMatcher, conditionMatcher, ThreadLocalRandom.current());
    }

    /** Test/ops seam: inject a deterministic {@link RandomGenerator} (e.g. a seeded SplittableRandom). */
    public RouteDispatcher(RoutePathMatcher pathMatcher, RouteConditionMatcher conditionMatcher,
                           RandomGenerator random) {
        this.pathMatcher = pathMatcher;
        this.conditionMatcher = conditionMatcher;
        this.random = Objects.requireNonNull(random, "random");
    }

    /** Replaces the WEIGHT traffic-split random source at runtime (ops/test seam). */
    public void setRandom(RandomGenerator random) {
        this.random = Objects.requireNonNull(random, "random");
    }

    public void updateRoutes(List<Route> routes, List<RouteCondition> conditions) {
        this.routeMap = routes.stream()
                .filter(r -> "BACKEND".equals(r.getRouteType()))
                .collect(Collectors.toMap(Route::getId, Function.identity()));

        Map<Long, Route> dispatchRoutes = routes.stream()
                .filter(r -> "DISPATCH".equals(r.getRouteType()))
                .collect(Collectors.toMap(Route::getId, Function.identity()));

        this.routeMap = new HashMap<>(this.routeMap);
        dispatchRoutes.forEach(this.routeMap::put);

        this.conditionMap = conditions.stream()
                .collect(Collectors.groupingBy(RouteCondition::getRouteId));

        // S12-2（缺陷②）：注册顺序确定化 —— DISPATCH 优先 → sort_order 升序 → id 升序。
        // 上游取数（DB 查询 / 缓存 Map）顺序不稳定，直接按入参顺序注册会让 path 匹配的
        // 「先注册者胜出」结果随 DB 返回顺序漂移（DISPATCH 父路由可能被后置路由抢走入口）。
        pathMatcher.clear();
        for (Route route : orderedRoutes(routes)) {
            if (route.getPath() != null) {
                pathMatcher.addRoute(route.getId(), route.getPath(), route.getRouteType());
            }
        }
    }

    /**
     * 路由注册顺序（DISPATCH 优先 → sort_order 升序 → id 升序）。
     *
     * <p>与 SCG 注册层 {@code DynamicRouteLocator} 的 order 口径一致（DISPATCH 的
     * order = -1_000_000 + sort_order，恒排在 BACKEND 之前）。id 升序兜底，保证
     * sort_order 相同的路由也有确定顺序（不再依赖 DB 返回顺序）。</p>
     */
    static List<Route> orderedRoutes(List<Route> routes) {
        return routes.stream()
                .sorted(Comparator.comparingInt(RouteDispatcher::typeRank)
                        .thenComparingInt(RouteDispatcher::sortOrderOf)
                        .thenComparing(RouteDispatcher::idOf))
                .toList();
    }

    /** DISPATCH 优先（0）于 BACKEND（1）。 */
    private static int typeRank(Route route) {
        return "DISPATCH".equals(route.getRouteType()) ? 0 : 1;
    }

    private static int sortOrderOf(Route route) {
        return route.getSortOrder() != null ? route.getSortOrder() : 0;
    }

    private static Long idOf(Route route) {
        return route.getId() != null ? route.getId() : Long.MAX_VALUE;
    }

    public Mono<ResolvedRoute> dispatch(ServerWebExchange exchange) {
        String requestPath = exchange.getRequest().getPath().value();
        Optional<Long> entryRouteId = pathMatcher.match(requestPath);

        if (entryRouteId.isEmpty()) {
            log.info("Dispatch: no path match for {} ({} patterns registered)", requestPath, pathMatcherSize());
            return Mono.empty();
        }

        Route entryRoute = routeMap.get(entryRouteId.get());
        if (entryRoute == null) {
            log.info("Dispatch: path matched route {} but it is not in the published route map", entryRouteId.get());
            return Mono.empty();
        }

        if ("BACKEND".equals(entryRoute.getRouteType())) {
            return Mono.just(new ResolvedRoute(
                    entryRoute.getId(),
                    entryRoute.getUpstreamUrl(),
                    entryRoute.getPath(),
                    List.of(entryRoute.getId())
            ));
        }

        Set<Long> visited = new HashSet<>();
        visited.add(entryRoute.getId());
        List<Long> dispatchPath = new ArrayList<>();
        dispatchPath.add(entryRoute.getId());

        return ensureBodyCachedIfNeeded(exchange)
                .then(dispatchRecursive(exchange, entryRoute, visited, dispatchPath, 1));
    }

    private Mono<Void> ensureBodyCachedIfNeeded(ServerWebExchange exchange) {
        if (exchange.getAttribute(GatewayConstants.CACHED_REQUEST_BODY_KEY) != null) {
            return Mono.empty();
        }
        if (!hasBodyDependentConditions()) {
            return Mono.empty();
        }
        return org.springframework.core.io.buffer.DataBufferUtils.join(
                        exchange.getRequest().getBody(), 1024 * 1024)
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    org.springframework.core.io.buffer.DataBufferUtils.release(dataBuffer);
                    exchange.getAttributes().put(GatewayConstants.CACHED_REQUEST_BODY_KEY,
                            new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                    return (Void) null;
                })
                .switchIfEmpty(Mono.fromRunnable(() ->
                        exchange.getAttributes().put(GatewayConstants.CACHED_REQUEST_BODY_KEY, "")));
    }

    private boolean hasBodyDependentConditions() {
        return conditionMap.values().stream()
                .flatMap(List::stream)
                .anyMatch(c -> "BODY".equals(c.getConditionType()) || "GROOVY".equals(c.getConditionType()));
    }

    private Mono<ResolvedRoute> dispatchRecursive(ServerWebExchange exchange, Route currentRoute,
                                                   Set<Long> visited, List<Long> dispatchPath, int depth) {
        if (depth > GatewayConstants.MAX_DISPATCH_DEPTH) {
            return Mono.error(new DepthExceededException(depth));
        }

        List<RouteCondition> conditions = conditionMap.getOrDefault(currentRoute.getId(), List.of());
        List<RouteCondition> sorted = new ArrayList<>(conditions);
        sorted.sort(Comparator.comparingInt(RouteCondition::getPriority));

        // WEIGHT 条件不是请求谓词（恒不参与 match），先摘出走加权随机通道；
        // 非 WEIGHT 条件保持既有语义：priority 升序，首个匹配且目标可解析者胜出。
        List<RouteCondition> weightCandidates = new ArrayList<>();
        for (RouteCondition condition : sorted) {
            if (ConditionType.WEIGHT.code().equals(condition.getConditionType())) {
                weightCandidates.add(condition);
                continue;
            }
            if (conditionMatcher.match(exchange, condition)) {
                Long targetId = condition.getTargetRouteId();
                if (visited.contains(targetId)) {
                    return Mono.error(new CyclicReferenceException(
                            buildCyclePath(dispatchPath, targetId)));
                }

                Route targetRoute = targetId == null ? null : routeMap.get(targetId);
                if (targetRoute == null) {
                    log.warn("Dispatch route {} condition {}={} matched but target route {} is missing/unpublished",
                            currentRoute.getId(), condition.getConditionKey(), condition.getConditionValue(), targetId);
                    continue;
                }

                if ("BACKEND".equals(targetRoute.getRouteType())) {
                    List<Long> fullPath = new ArrayList<>(dispatchPath);
                    fullPath.add(targetId);
                    return Mono.just(new ResolvedRoute(
                            targetRoute.getId(),
                            targetRoute.getUpstreamUrl(),
                            targetRoute.getPath(),
                            fullPath
                    ));
                }

                visited.add(targetId);
                dispatchPath.add(targetId);
                return dispatchRecursive(exchange, targetRoute, visited, dispatchPath, depth + 1);
            }
        }

        if (weightCandidates.isEmpty()) {
            log.info("Dispatch route {} resolved no target from {} condition(s)", currentRoute.getId(), sorted.size());
            return Mono.empty();
        }
        return dispatchWeighted(exchange, currentRoute, weightCandidates, visited, dispatchPath, depth);
    }

    /**
     * WEIGHT 流量分割（MSE 金丝雀 / APISIX traffic-split 口径）。仅当同一分发路由下
     * 没有任何非 WEIGHT 条件匹配时才进入本通道；权重取 {@code condition_key} 中的
     * 正整数字符串（如 {@code "20"}/{@code "80"}），{@code condition_value} 可空忽略。
     *
     * <p>候选口径：① 目标路由缺失/未发布 → 剔除（与既有 continue 语义一致）；
     * ② 目标已在 visited（成环）→ 剔除并告警（加权通道按配置错误跳过而非随机抛环错误，
     * 全部候选成环时按既有 no-target 兜底返回 empty→404）；③ 权重非法（空/非数字/
     * 0/负数）→ 该候选权重记 0，不参与加权随机，但保留其目标参与"全 0 兜底"；
     * ④ 权重之和为 0 → 既有默认选择：priority 升序首个目标可解析的候选。</p>
     */
    private Mono<ResolvedRoute> dispatchWeighted(ServerWebExchange exchange, Route currentRoute,
                                                 List<RouteCondition> weightCandidates, Set<Long> visited,
                                                 List<Long> dispatchPath, int depth) {
        List<RouteCondition> resolvable = new ArrayList<>(weightCandidates.size());
        List<Long> weights = new ArrayList<>(weightCandidates.size());
        long total = 0;
        for (RouteCondition condition : weightCandidates) {
            Long targetId = condition.getTargetRouteId();
            Route targetRoute = targetId == null ? null : routeMap.get(targetId);
            if (targetRoute == null) {
                log.warn("Dispatch route {} weight candidate (key={}) targets missing/unpublished route {}, ignoring",
                        currentRoute.getId(), condition.getConditionKey(), targetId);
                continue;
            }
            if (visited.contains(targetId)) {
                log.warn("Dispatch route {} weight candidate targets route {} forming cycle {}, ignoring",
                        currentRoute.getId(), targetId, buildCyclePath(dispatchPath, targetId));
                continue;
            }
            long weight = parseWeight(currentRoute, condition);
            if (weight > 0) {
                total += weight;
            }
            resolvable.add(condition);
            weights.add(weight);
        }

        if (resolvable.isEmpty()) {
            log.info("Dispatch route {} resolved no target from {} weight candidate(s)",
                    currentRoute.getId(), weightCandidates.size());
            return Mono.empty();
        }

        int chosenIndex;
        if (total > 0) {
            chosenIndex = selectByWeight(resolvable.size(), weights, total);
        } else {
            // 全部候选权重之和为 0（全部非法/为 0）→ 既有默认选择：priority 升序首个可解析候选。
            chosenIndex = 0;
            log.info("Dispatch route {} weight candidates sum to 0, falling back to priority-first candidate {}",
                    currentRoute.getId(), resolvable.get(0).getTargetRouteId());
        }

        RouteCondition chosen = resolvable.get(chosenIndex);
        Long targetId = chosen.getTargetRouteId();
        Route targetRoute = routeMap.get(targetId);
        if ("BACKEND".equals(targetRoute.getRouteType())) {
            List<Long> fullPath = new ArrayList<>(dispatchPath);
            fullPath.add(targetId);
            return Mono.just(new ResolvedRoute(
                    targetRoute.getId(),
                    targetRoute.getUpstreamUrl(),
                    targetRoute.getPath(),
                    fullPath
            ));
        }

        visited.add(targetId);
        dispatchPath.add(targetId);
        return dispatchRecursive(exchange, targetRoute, visited, dispatchPath, depth + 1);
    }

    /**
     * 累积权重区间法：r = random * total，落在哪个候选的 [accBefore, accAfter) 区间即选中谁。
     * 权重为 0 的候选区间为空，永远不会被选中；浮点安全兜底取最后一个正权重候选。
     */
    private int selectByWeight(int candidateCount, List<Long> weights, long total) {
        double r = random.nextDouble() * total;
        long acc = 0;
        int lastPositive = 0;
        for (int i = 0; i < candidateCount; i++) {
            long w = weights.get(i);
            if (w > 0) {
                acc += w;
                lastPositive = i;
                if (r < acc) {
                    return i;
                }
            }
        }
        return lastPositive;
    }

    /**
     * 权重 = {@code condition_key} 的正整数字符串（如 {@code "20"}，容忍前后空白）。
     * 空/非数字/0/负数均按非法处理（记 0 并告警）；仅支持整数（与 MSE/APISIX 口径一致），
     * {@code "20.5"} 这类小数视为非法。
     */
    private long parseWeight(Route currentRoute, RouteCondition condition) {
        String key = condition.getConditionKey();
        if (key == null || key.isBlank()) {
            log.warn("Dispatch route {} weight candidate has blank condition_key, treating weight as 0",
                    currentRoute.getId());
            return 0;
        }
        try {
            long weight = Long.parseLong(key.trim());
            if (weight <= 0) {
                log.warn("Dispatch route {} weight candidate has non-positive weight '{}', treating as 0",
                        currentRoute.getId(), key);
                return 0;
            }
            return weight;
        } catch (NumberFormatException e) {
            log.warn("Dispatch route {} weight candidate has non-numeric weight '{}', treating as 0",
                    currentRoute.getId(), key);
            return 0;
        }
    }

    private int pathMatcherSize() {
        return pathMatcher != null ? pathMatcher.size() : -1;
    }

    private String buildCyclePath(List<Long> dispatchPath, Long cycleTarget) {
        StringBuilder sb = new StringBuilder();
        for (Long id : dispatchPath) {
            if (!sb.isEmpty()) sb.append(" -> ");
            sb.append(id);
        }
        sb.append(" -> ").append(cycleTarget);
        return sb.toString();
    }
}
