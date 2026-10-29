package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RouteServiceTest {

    @Mock private RouteMapper routeMapper;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private RouteValidator routeValidator;
    @Mock private PluginService pluginService;
    @Mock private ApplicationEventPublisher eventPublisher;

    private RouteService routeService;

    private Route testRoute;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        routeService = new RouteService(conditionMapper, bindingMapper, routeValidator, pluginService, eventPublisher);
        setBaseMapper(routeService, routeMapper);

        testRoute = Route.builder()
                .id(1L).routeName("test-route").routeType("BACKEND")
                .path("/api/users").upstreamUrl("http://users:8080")
                .status("DRAFT").sortOrder(0).build();
    }

    private void setBaseMapper(Object service, Object mapper) throws Exception {
        Field field = findField(service.getClass(), "baseMapper");
        field.setAccessible(true);
        field.set(service, mapper);
    }

    private Field findField(Class<?> clazz, String name) {
        for (Class<?> c = clazz; c != null; c = c.getSuperclass()) {
            try { return c.getDeclaredField(name); } catch (NoSuchFieldException e) { /* continue */ }
        }
        throw new RuntimeException("Field not found: " + name);
    }

    @Test
    void createRouteWithoutConditions() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(1L);
            return 1;
        });

        Route result = routeService.createRoute(testRoute, null, null);
        assertNotNull(result);
        verify(routeMapper).insert(testRoute);
        verify(conditionMapper, never()).insert(any(RouteCondition.class));
    }

    @Test
    void createRouteWithConditions() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(1L);
            return 1;
        });

        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v2")
                .targetRouteId(2L).priority(0).build();

        Route result = routeService.createRoute(testRoute, List.of(cond), null);
        assertNotNull(result);
        assertEquals(1L, cond.getRouteId());
        verify(conditionMapper).insert(cond);
    }

    @Test
    void createRouteWithPluginIds() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(1L);
            return 1;
        });
        when(bindingMapper.insert(any(RoutePluginBinding.class))).thenReturn(1);

        Route result = routeService.createRoute(testRoute, null, List.of(10L, 20L));
        assertNotNull(result);
        verify(bindingMapper, times(2)).insert(any(RoutePluginBinding.class));
    }

    @Test
    void createDispatchRouteValidatesCycle() {
        testRoute.setRouteType("DISPATCH");
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(1L);
            return 1;
        });
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1")
                .targetRouteId(2L).priority(0).build();

        routeService.createRoute(testRoute, List.of(cond), null);
        verify(routeValidator).validateCyclicReference(eq(1L), anyMap());
    }

    @Test
    void createBackendRouteWithoutPathThrows() {
        testRoute.setPath(null);
        assertThrows(BusinessException.class, () -> routeService.createRoute(testRoute, null, null));
    }

    @Test
    void createBackendRouteWithoutUpstreamUrlThrows() {
        testRoute.setUpstreamUrl(null);
        assertThrows(BusinessException.class, () -> routeService.createRoute(testRoute, null, null));
    }

    @Test
    void createDispatchRouteWithoutConditionsThrows() {
        testRoute.setRouteType("DISPATCH");
        assertThrows(BusinessException.class, () -> routeService.createRoute(testRoute, null, null));
    }

    @Test
    void updateRouteSuccess() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);

        Route update = new Route();
        update.setId(1L);
        update.setRouteName("updated-name");
        routeService.updateRoute(update, null, null);

        verify(routeMapper).updateById(any(Route.class));
    }

    @Test
    void updateRouteNotFound() {
        when(routeMapper.selectById(999L)).thenReturn(null);

        Route update = new Route();
        update.setId(999L);
        assertThrows(BusinessException.class, () -> routeService.updateRoute(update, null, null));
    }

    @Test
    void updatePublishedRouteThrows() {
        testRoute.setStatus("PUBLISHED");
        when(routeMapper.selectById(1L)).thenReturn(testRoute);

        Route update = new Route();
        update.setId(1L);
        assertThrows(BusinessException.class, () -> routeService.updateRoute(update, null, null));
    }

    @Test
    void deleteRouteSuccess() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(conditionMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(routeMapper.deleteById(1L)).thenReturn(1);

        routeService.deleteRoute(1L);
        verify(routeMapper).deleteById(1L);
        verify(conditionMapper).delete(any(LambdaQueryWrapper.class));
        verify(bindingMapper).delete(any(LambdaQueryWrapper.class));
    }

    @Test
    void deleteRouteReferencedByOthersThrows() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(conditionMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(2L);

        assertThrows(BusinessException.class, () -> routeService.deleteRoute(1L));
    }

    @Test
    void deletePublishedRouteThrows() {
        testRoute.setStatus("PUBLISHED");
        when(routeMapper.selectById(1L)).thenReturn(testRoute);

        assertThrows(BusinessException.class, () -> routeService.deleteRoute(1L));
    }

    @Test
    void publishRouteSuccess() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);

        routeService.publishRoute(1L);
        assertEquals("PUBLISHED", testRoute.getStatus());
    }

    @Test
    void publishAlreadyPublishedRouteThrows() {
        testRoute.setStatus("PUBLISHED");
        when(routeMapper.selectById(1L)).thenReturn(testRoute);

        assertThrows(BusinessException.class, () -> routeService.publishRoute(1L));
    }

    @Test
    void offlineRouteSuccess() {
        testRoute.setStatus("PUBLISHED");
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);

        routeService.offlineRoute(1L);
        assertEquals("OFFLINE", testRoute.getStatus());
    }

    @Test
    void offlineDraftRouteThrows() {
        testRoute.setStatus("DRAFT");
        when(routeMapper.selectById(1L)).thenReturn(testRoute);

        assertThrows(BusinessException.class, () -> routeService.offlineRoute(1L));
    }

    @Test
    void validateRouteCallsValidator() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1")
                .targetRouteId(2L).priority(0).build();

        routeService.validateRoute(1L, List.of(cond));
        verify(routeValidator).validateCyclicReference(eq(1L), anyMap());
    }

    @Test
    void validateRouteNotFoundThrows() {
        when(routeMapper.selectById(999L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> routeService.validateRoute(999L, List.of()));
    }

    // ==================== 阶段二 T3：路由复制 ====================

    @Test
    void duplicateRouteCopiesConditionsAndBindingsAsDraft() {
        Route source = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/api").upstreamUrl("http://api").status("PUBLISHED")
                .sortOrder(3).remark("r").tags("prod,pay").build();
        when(routeMapper.selectById(1L)).thenReturn(source);
        when(routeMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(200L);
            return 1;
        });
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(1L).targetRouteId(9L)
                        .conditionType("HEADER").operator("EQ").priority(1).build()));
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RoutePluginBinding.builder().routeId(1L).pluginId(7L).sortOrder(0).build()));

        Route copy = routeService.duplicateRoute(1L);

        assertEquals("api_copy", copy.getRouteName());
        assertEquals("DRAFT", copy.getStatus());
        assertEquals("prod,pay", copy.getTags());
        assertEquals("http://api", copy.getUpstreamUrl());
        verify(conditionMapper).insert(any(RouteCondition.class));
        verify(bindingMapper).insert(any(RoutePluginBinding.class));
    }

    @Test
    void duplicateRouteNameConflictGetsSuffix() {
        Route source = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/api").upstreamUrl("http://api").build();
        when(routeMapper.selectById(1L)).thenReturn(source);
        // api_copy 已存在 → 追加 _2（首次 count 命中冲突，其后放行）
        when(routeMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L, 0L);
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(201L);
            return 1;
        });

        Route copy = routeService.duplicateRoute(1L);

        assertEquals("api_copy_2", copy.getRouteName());
    }

    @Test
    void duplicateRouteNotFoundThrows() {
        when(routeMapper.selectById(404L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> routeService.duplicateRoute(404L));
    }
}
