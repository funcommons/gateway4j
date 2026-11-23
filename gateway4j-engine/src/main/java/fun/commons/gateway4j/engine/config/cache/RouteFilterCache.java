package fun.commons.gateway4j.engine.config.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import fun.commons.gateway4j.common.model.RouteFilter;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 路由级 SCG 原生 filter 缓存（S12-7a）。
 *
 * <p>取数一次（{@code selectList(null)} 全量）、内存按 route_id 分组：数据面
 * 每请求只做一次 map 查表，不触库（N+1 铁律）。口径同 S12-1 的
 * {@link RoutePredicateCache}。</p>
 *
 * <p>本类不引用任何 Spring Cloud Gateway 类型——与 {@link RouteConfigCache} 同理，
 * 引擎缓存层必须同时能被 admin-boot（Servlet，无 SCG classpath）装载。</p>
 */
public class RouteFilterCache {

    private final Cache<Long, List<RouteFilter>> cache;

    public RouteFilterCache() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(10_000)
                .build();
    }

    /** 全量刷新：按 route_id 分组，组内按 sort_order → id 排序。 */
    public void refreshAll(List<RouteFilter> filters) {
        cache.invalidateAll();
        if (filters == null || filters.isEmpty()) {
            return;
        }
        Map<Long, List<RouteFilter>> grouped = new LinkedHashMap<>();
        for (RouteFilter filter : filters) {
            if (filter == null || filter.getRouteId() == null) {
                continue;
            }
            grouped.computeIfAbsent(filter.getRouteId(), k -> new ArrayList<>()).add(filter);
        }
        grouped.forEach((routeId, list) -> {
            list.sort(Comparator
                    .comparing((RouteFilter f) -> f.getSortOrder() != null ? f.getSortOrder() : 0)
                    .thenComparing(f -> f.getId() != null ? f.getId() : 0L));
            cache.put(routeId, List.copyOf(list));
        });
    }

    /** 某路由的 filter 行（按 sort_order 升序）。 */
    public List<RouteFilter> getByRouteId(Long routeId) {
        if (routeId == null) {
            return List.of();
        }
        List<RouteFilter> filters = cache.getIfPresent(routeId);
        return filters == null ? List.of() : filters;
    }

    /** 某路由的 filter 定义串（按 sort_order 升序，= SCG filters[] 声明顺序）。 */
    public List<String> getDefinitions(Long routeId) {
        return getByRouteId(routeId).stream()
                .map(RouteFilter::getDefinition)
                .filter(d -> d != null && !d.isBlank())
                .toList();
    }

    /** 已装载的 filter 行总数（观测用）。 */
    public int size() {
        return cache.asMap().values().stream().mapToInt(List::size).sum();
    }
}
