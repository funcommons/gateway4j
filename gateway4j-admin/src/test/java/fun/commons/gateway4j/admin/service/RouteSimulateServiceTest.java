package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * P2-6 路由模拟（Trace-lite）单测：匹配语义与数据面 DynamicRouteLocator 同源
 * （仅 PUBLISHED、PathPattern、DISPATCH 优先排序、条件 priority 升序首个命中）。
 */
@ExtendWith(MockitoExtension.class)
class RouteSimulateServiceTest {

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private PluginService pluginService;

    private RouteSimulateService service;

    @BeforeEach
    void setUp() {
        service = new RouteSimulateService(routeService, conditionMapper, bindingMapper, pluginService);
        lenient().when(pluginService.listGlobalPlugins("PRE")).thenReturn(List.of());
        lenient().when(pluginService.listGlobalPlugins("POST")).thenReturn(List.of());
        lenient().when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        lenient().when(routeService.getById(any())).thenReturn(null);
    }

    private void publish(Route... routes) {
        when(routeService.listRoutes(eq(null), eq("PUBLISHED"), eq(null))).thenReturn(List.of(routes));
    }

    @Test
    void backendRouteWildcardHit() {
        publish(Route.builder().id(1L).routeName("user-api").routeType("BACKEND")
                .path("/api/user/**").upstreamUrl("http://user-svc:8080").sortOrder(0).build());

        Map<String, Object> result = service.simulate("/api/user/1/detail", "GET", Map.of(), Map.of());

        assertEquals(true, result.get("matched"));
        @SuppressWarnings("unchecked")
        Map<String, Object> route = (Map<String, Object>) result.get("route");
        assertEquals("user-api", route.get("route_name"));
        assertEquals("BACKEND", route.get("route_type"));
        assertEquals("http://user-svc:8080", route.get("upstream_url"));
        assertFalse(((List<?>) result.get("evaluated")).isEmpty());
    }

    @Test
    void draftRouteNeverMatches() {
        // 未发布的路由不参与（listRoutes status=PUBLISHED 过滤由 SQL 语义承担，此处空表）
        publish();

        Map<String, Object> result = service.simulate("/api/user/1", "GET", Map.of(), Map.of());

        assertEquals(false, result.get("matched"));
        assertNull(result.get("route"));
        @SuppressWarnings("unchecked")
        Map<String, Object> plugins = (Map<String, Object>) result.get("plugins");
        assertNotNull(plugins.get("global_pre"));
        assertNotNull(plugins.get("route"));
        assertNotNull(plugins.get("global_post"));
    }

    @Test
    void dispatchWinsOverBackendOnSamePath() {
        // DISPATCH 排序在前（order=-1e6+sort），同 path 下先命中（与 engine 一致）
        Route dispatch = Route.builder().id(10L).routeName("dispatch").routeType("DISPATCH")
                .path("/api/user/**").sortOrder(0).build();
        Route backend = Route.builder().id(11L).routeName("legacy").routeType("BACKEND")
                .path("/api/user/**").sortOrder(0).build();
        publish(dispatch, backend);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("HEADER").operator("EQ").conditionKey("X-Version")
                        .conditionValue("v2").priority(0).build()));
        when(routeService.getById(11L)).thenReturn(backend);

        Map<String, Object> result = service.simulate("/api/user/1", "GET",
                Map.of("X-Version", "v2"), Map.of());

        assertEquals(true, result.get("matched"));
        @SuppressWarnings("unchecked")
        Map<String, Object> route = (Map<String, Object>) result.get("route");
        assertEquals("dispatch", route.get("route_name"));

        @SuppressWarnings("unchecked")
        Map<String, Object> dispatchTrace = (Map<String, Object>) result.get("dispatch");
        assertEquals("11", ((Map<?, ?>) dispatchTrace.get("resolved_target")).get("id"));

        List<?> evaluated = (List<?>) result.get("evaluated");
        assertEquals(2, evaluated.size());
        assertEquals(true, ((Map<?, ?>) evaluated.get(0)).get("matched"));
        assertEquals("dispatch", ((Map<?, ?>) evaluated.get(0)).get("route_name"));
        assertEquals("legacy", ((Map<?, ?>) evaluated.get(1)).get("route_name"));
        assertEquals(false, ((Map<?, ?>) evaluated.get(1)).get("matched"));
    }

    @Test
    void dispatchConditionMissLeavesTargetUnresolved() {
        Route dispatch = Route.builder().id(10L).routeName("dispatch").routeType("DISPATCH")
                .path("/api/user/**").sortOrder(0).build();
        Route backend = Route.builder().id(11L).routeName("v2").routeType("BACKEND")
                .path("/api/user/**").sortOrder(0).build();
        publish(dispatch, backend);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("HEADER").operator("EQ").conditionKey("X-Version")
                        .conditionValue("v2").priority(0).build()));
        when(routeService.getById(11L)).thenReturn(backend);

        Map<String, Object> result = service.simulate("/api/user/1", "GET", Map.of(), Map.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> dispatchTrace = (Map<String, Object>) result.get("dispatch");
        assertNull(dispatchTrace.get("resolved_target"));
        List<?> conditions = (List<?>) dispatchTrace.get("conditions");
        assertEquals(false, ((Map<?, ?>) conditions.get(0)).get("matched"));
    }

    @Test
    void bodyAndGroovyConditionsAreSkippedNotExecuted() {
        Route dispatch = Route.builder().id(10L).routeName("dispatch").routeType("DISPATCH")
                .path("/api/**").sortOrder(0).build();
        Route backend = Route.builder().id(11L).routeName("v2").routeType("BACKEND")
                .path("/api/**").sortOrder(0).build();
        publish(dispatch, backend);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("BODY").operator("EQ").conditionKey("$.channel")
                        .conditionValue("app").priority(0).build(),
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("GROOVY").operator("EQ").conditionKey("")
                        .conditionValue("true").priority(1).build()));
        when(routeService.getById(11L)).thenReturn(backend);

        Map<String, Object> result = service.simulate("/api/x", "POST", Map.of(), Map.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> dispatchTrace = (Map<String, Object>) result.get("dispatch");
        assertNull(dispatchTrace.get("resolved_target"), "BODY/GROOVY 跳过求值 → 无 resolved_target");
        List<?> conditions = (List<?>) dispatchTrace.get("conditions");
        assertTrue(String.valueOf(((Map<?, ?>) conditions.get(0)).get("reason"))
                .contains("Trace-lite"));
    }

    @Test
    void weightConditionListedAsCandidateOnly() {
        Route dispatch = Route.builder().id(10L).routeName("dispatch").routeType("DISPATCH")
                .path("/pay/**").sortOrder(0).build();
        Route backend = Route.builder().id(11L).routeName("gray").routeType("BACKEND")
                .path("/pay/**").sortOrder(0).build();
        publish(dispatch, backend);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("WEIGHT").operator("EQ").conditionKey("20")
                        .priority(0).build()));
        when(routeService.getById(11L)).thenReturn(backend);

        Map<String, Object> result = service.simulate("/pay/now", "GET", Map.of(), Map.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> dispatchTrace = (Map<String, Object>) result.get("dispatch");
        assertNull(dispatchTrace.get("resolved_target"), "WEIGHT 不掷点，Trace-lite 不随机选路");
        List<?> candidates = (List<?>) dispatchTrace.get("weight_candidates");
        assertEquals(1, candidates.size());
        assertEquals("20", ((Map<?, ?>) candidates.get(0)).get("weight"));
    }

    @Test
    void queryConditionEqMatch() {
        Route dispatch = Route.builder().id(10L).routeName("dispatch").routeType("DISPATCH")
                .path("/api/**").sortOrder(0).build();
        Route backend = Route.builder().id(11L).routeName("mobile").routeType("BACKEND")
                .path("/api/**").sortOrder(0).build();
        publish(dispatch, backend);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(10L).targetRouteId(11L)
                        .conditionType("QUERY").operator("EQ").conditionKey("channel")
                        .conditionValue("app").priority(0).build()));
        when(routeService.getById(11L)).thenReturn(backend);

        Map<String, Object> result = service.simulate("/api/x", "GET", Map.of(), Map.of("channel", "app"));

        @SuppressWarnings("unchecked")
        Map<String, Object> dispatchTrace = (Map<String, Object>) result.get("dispatch");
        assertEquals("11", ((Map<?, ?>) dispatchTrace.get("resolved_target")).get("id"));
    }

    @Test
    void exactPathMissReportsReason() {
        publish(Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/api/user/**").sortOrder(0).build());

        Map<String, Object> result = service.simulate("/other/path", "GET", Map.of(), Map.of());

        assertEquals(false, result.get("matched"));
        List<?> evaluated = (List<?>) result.get("evaluated");
        assertEquals(1, evaluated.size());
        String reason = (String) ((Map<?, ?>) evaluated.get(0)).get("reason");
        assertTrue(reason.contains("path 不匹配"));
    }
}
