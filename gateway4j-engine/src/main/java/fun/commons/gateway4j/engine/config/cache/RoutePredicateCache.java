package fun.commons.gateway4j.engine.config.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import fun.commons.gateway4j.common.model.RoutePredicate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 路由级 SCG 原生谓词缓存（S12-1）。
 *
 * <p>取数一次（{@code selectList(null)} 全量）、内存按 route_id 分组：数据面
 * 每请求只做一次 map 查表，不触库（N+1 铁律）。</p>
 *
 * <p>本类不引用任何 Spring Cloud Gateway 类型——与 {@link RouteConfigCache} 同理，
 * 引擎缓存层必须同时能被 admin-boot（Servlet，无 SCG classpath）装载。</p>
 */
public class RoutePredicateCache {

    private final Cache<Long, List<RoutePredicate>> cache;

    public RoutePredicateCache() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(10_000)
                .build();
    }

    /** 全量刷新：按 route_id 分组，组内按 sort_order → id 排序。 */
    public void refreshAll(List<RoutePredicate> predicates) {
        cache.invalidateAll();
        if (predicates == null || predicates.isEmpty()) {
            return;
        }
        Map<Long, List<RoutePredicate>> grouped = new LinkedHashMap<>();
        for (RoutePredicate predicate : predicates) {
            if (predicate == null || predicate.getRouteId() == null) {
                continue;
            }
            grouped.computeIfAbsent(predicate.getRouteId(), k -> new ArrayList<>()).add(predicate);
        }
        grouped.forEach((routeId, list) -> {
            list.sort(Comparator
                    .comparing((RoutePredicate p) -> p.getSortOrder() != null ? p.getSortOrder() : 0)
                    .thenComparing(p -> p.getId() != null ? p.getId() : 0L));
            cache.put(routeId, List.copyOf(list));
        });
    }

    /** 某路由的谓词行（按 sort_order 升序）。 */
    public List<RoutePredicate> getByRouteId(Long routeId) {
        if (routeId == null) {
            return List.of();
        }
        List<RoutePredicate> predicates = cache.getIfPresent(routeId);
        return predicates == null ? List.of() : predicates;
    }

    /** 某路由的谓词定义串（按 sort_order 升序）。 */
    public List<String> getDefinitions(Long routeId) {
        return getByRouteId(routeId).stream()
                .map(RoutePredicate::getDefinition)
                .filter(d -> d != null && !d.isBlank())
                .toList();
    }

    /** 已装载的谓词行总数（观测用）。 */
    public int size() {
        return cache.asMap().values().stream().mapToInt(List::size).sum();
    }
}
