package fun.commons.gateway4j.engine.config.cache;

import fun.commons.gateway4j.common.model.RouteFilter;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-7a：路由级 SCG 原生 filter 行缓存（全量取数一次 + 内存按 route_id 分组，
 * 禁 N+1；口径同 S12-1 的 RoutePredicateCache）。
 */
class RouteFilterCacheTest {

    // ------------------------------------------------------------------
    // 1) 按 route_id 分组，组内按 sort_order → id 排序
    // ------------------------------------------------------------------
    @Test
    void groupsByRouteIdAndSortsWithinGroup() {
        RouteFilterCache cache = new RouteFilterCache();
        cache.refreshAll(List.of(
                RouteFilter.builder().id(3L).routeId(2L).definition("StripPrefix=1").sortOrder(2).build(),
                RouteFilter.builder().id(2L).routeId(1L).definition("RewritePath=/a,/b").sortOrder(2).build(),
                RouteFilter.builder().id(1L).routeId(1L).definition("AddRequestHeader=X-Foo, bar").sortOrder(1).build(),
                RouteFilter.builder().id(4L).routeId(1L).definition("PreserveHostHeader").sortOrder(2).build()));

        // 同 sort_order 时按 id 升序兜底（2 在 4 前）
        assertEquals(List.of("AddRequestHeader=X-Foo, bar", "RewritePath=/a,/b", "PreserveHostHeader"),
                cache.getDefinitions(1L));
        assertEquals(List.of("StripPrefix=1"), cache.getDefinitions(2L));
        assertEquals(4, cache.size());
    }

    // ------------------------------------------------------------------
    // 2) 刷新清空：空刷新后旧内容不残留；null/blank 定义串不进缓存
    // ------------------------------------------------------------------
    @Test
    void refreshAllReplacesPreviousContent() {
        RouteFilterCache cache = new RouteFilterCache();
        cache.refreshAll(List.of(
                RouteFilter.builder().id(1L).routeId(1L).definition("StripPrefix=1").sortOrder(0).build()));

        assertEquals(List.of("StripPrefix=1"), cache.getDefinitions(1L));

        cache.refreshAll(List.of());
        assertEquals(0, cache.size());
        assertTrue(cache.getDefinitions(1L).isEmpty());

        cache.refreshAll(null);
        assertEquals(0, cache.size());
    }

    // ------------------------------------------------------------------
    // 3) null routeId / null 行 / blank 定义串防御
    // ------------------------------------------------------------------
    @Test
    void nullAndBlankRowsAreIgnored() {
        RouteFilterCache cache = new RouteFilterCache();
        cache.refreshAll(java.util.Arrays.asList(
                null,
                RouteFilter.builder().id(1L).definition("AddRequestHeader=X-Foo, bar").sortOrder(0).build(),
                RouteFilter.builder().id(2L).routeId(1L).definition("  ").sortOrder(0).build(),
                RouteFilter.builder().id(3L).routeId(1L).definition("StripPrefix=1").sortOrder(0).build()));

        assertEquals(List.of("StripPrefix=1"), cache.getDefinitions(1L));
        assertTrue(cache.getDefinitions(null).isEmpty());
    }
}
