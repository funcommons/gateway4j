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
    @Mock private RouteVersionService routeVersionService;

    private RouteService routeService;

    private Route testRoute;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        routeService = new RouteService(conditionMapper, bindingMapper, routeValidator, pluginService,
                eventPublisher, routeVersionService);
        setBaseMapper(routeService, routeMapper);

        // 纯单测无 MyBatis-Plus 启动流程：手动注册 Route 的 TableInfo，
        // 否则 LambdaQueryWrapper 解析 Route::getEnvironment 时报
        // "can not find lambda cache for this entity"
        if (com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(Route.class) == null) {
            com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                    new org.apache.ibatis.builder.MapperBuilderAssistant(
                            new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                    Route.class);
        }

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

    // ==================== T1：PATCH 静默重置 status（既有缺陷回归） ====================

    /**
     * T1 回归：OFFLINE 路由只 PATCH remark → status 仍 OFFLINE，sort_order/tags/
     * config_version 维持既有值。服务层改为 load-modify-save + 白名单拷贝：
     * 只收 PATCH 可修改字段，status/route_type/config_version 一律不采信入参
     * （null = 请求未携带，由控制器抵消 @Builder.Default 后保证）。
     */
    @Test
    void updateRoutePatchRemarkKeepsOfflineStatusAndUntouchedFields() {
        Route existing = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/api").upstreamUrl("http://api").status("OFFLINE")
                .sortOrder(5).tags("prod,pay").remark("旧").configVersion(7L).build();
        when(routeMapper.selectById(1L)).thenReturn(existing);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);

        // 控制器契约：null = 请求未携带（控制器已抵消 @Builder.Default 默认值）
        Route patch = new Route();
        patch.setId(1L);
        patch.setStatus(null);
        patch.setSortOrder(null);
        patch.setTags(null);
        patch.setConfigVersion(null);
        patch.setEnvironment(null);
        patch.setRemark("只改备注");
        routeService.updateRoute(patch, null, null);

        org.mockito.ArgumentCaptor<Route> captor =
                org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).updateById(captor.capture());
        Route saved = captor.getValue();
        assertSame(existing, saved, "应 load-modify-save：更新落在既有实体上");
        assertEquals("OFFLINE", saved.getStatus(), "PATCH remark 不得把 OFFLINE 重置为 DRAFT");
        assertEquals(Integer.valueOf(5), saved.getSortOrder(), "未携带 sort_order 不得被默认 0 覆盖");
        assertEquals("prod,pay", saved.getTags(), "未携带 tags 不得被默认空串覆盖");
        assertEquals(Long.valueOf(7L), saved.getConfigVersion(), "乐观锁版本不得被默认 0 清零");
        assertEquals("只改备注", saved.getRemark());
        assertEquals("/api", saved.getPath());
    }

    /** T1 回归：PUBLISHED 禁改保护不因重构松动（PATCH 仍拒绝、不落任何更新）。 */
    @Test
    void updateRouteStillRejectsPublishedRoute() {
        Route existing = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .status("PUBLISHED").sortOrder(2).build();
        when(routeMapper.selectById(1L)).thenReturn(existing);

        Route patch = new Route();
        patch.setId(1L);
        patch.setStatus(null);
        patch.setSortOrder(null);
        patch.setTags(null);
        patch.setEnvironment(null);
        patch.setRemark("x");
        assertThrows(BusinessException.class, () -> routeService.updateRoute(patch, null, null));
        verify(routeMapper, never()).updateById(any(Route.class));
    }

    /** T1：PATCH 显式携带的合法字段仍正常落库（白名单不放走合法更新）。 */
    @Test
    void updateRouteAppliesExplicitlyCarriedFields() {
        Route existing = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/old").upstreamUrl("http://old").status("DRAFT")
                .sortOrder(1).configVersion(2L).build();
        when(routeMapper.selectById(1L)).thenReturn(existing);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);

        Route patch = new Route();
        patch.setId(1L);
        patch.setPath("/new");
        patch.setUpstreamUrl("http://new");
        patch.setSortOrder(9);
        patch.setTags("gray");
        routeService.updateRoute(patch, null, null);

        assertEquals("/new", existing.getPath());
        assertEquals("http://new", existing.getUpstreamUrl());
        assertEquals(Integer.valueOf(9), existing.getSortOrder());
        assertEquals("gray", existing.getTags());
        assertEquals("DRAFT", existing.getStatus(), "入参即便携带也不得改 status");
        assertEquals(Long.valueOf(2L), existing.getConfigVersion(), "config_version 不经 PATCH 变更");
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

    // ==================== P2-2 多环境：CRUD env 缺省/校验/筛选/复制继承 ====================

    @Test
    void createRouteDefaultsEnvironmentToDefault() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(2L);
            return 1;
        });

        Route created = routeService.createRoute(
                Route.builder().routeName("no_env").routeType("BACKEND")
                        .path("/a").upstreamUrl("http://a").build(),
                null, null);

        assertEquals("default", created.getEnvironment(), "缺省 environment 落 default");
    }

    @Test
    void createRouteKeepsCustomEnvironment() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(2L);
            return 1;
        });

        Route created = routeService.createRoute(
                Route.builder().routeName("stg").routeType("BACKEND")
                        .path("/a").upstreamUrl("http://a").environment("staging").build(),
                null, null);

        assertEquals("staging", created.getEnvironment());
    }

    @Test
    void createRouteRejectsInvalidEnvironment() {
        Route bad = Route.builder().routeName("bad").routeType("BACKEND")
                .path("/a").upstreamUrl("http://a").environment("PROD X!").build();
        assertThrows(BusinessException.class, () -> routeService.createRoute(bad, null, null));
        verify(routeMapper, never()).insert(any(Route.class));
    }

    @Test
    void updateRouteWithoutEnvironmentKeepsExisting() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);
        when(routeMapper.updateById(any(Route.class))).thenReturn(1);
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        // 控制器契约：请求不带 environment 时显式置 null（抵消 @Builder.Default 的 new 默认值）
        Route patch = new Route();
        patch.setId(1L);
        patch.setRemark("只改备注");
        patch.setEnvironment(null);
        routeService.updateRoute(patch, List.of(), null);

        assertNull(patch.getEnvironment(), "服务层不得给未携带 environment 的更新注入环境");
    }

    @Test
    void updateRouteWithEnvironmentValidates() {
        when(routeMapper.selectById(1L)).thenReturn(testRoute);

        Route patch = new Route();
        patch.setId(1L);
        patch.setEnvironment("BAD NAME");
        assertThrows(BusinessException.class, () -> routeService.updateRoute(patch, null, null));
    }

    @Test
    void listRoutesFiltersByEnvironment() {
        when(routeMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        routeService.listRoutes(null, null, null, null, "staging");

        org.mockito.ArgumentCaptor<LambdaQueryWrapper<Route>> captor =
                org.mockito.ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(routeMapper).selectList(captor.capture());
        LambdaQueryWrapper<Route> wrapper = captor.getValue();
        assertTrue(wrapper.getSqlSegment().contains("environment"),
                "wrapper 应含 environment 列条件，实际: " + wrapper.getSqlSegment());
        assertTrue(wrapper.getParamNameValuePairs().containsValue("staging"),
                "wrapper 参数应含 staging，实际: " + wrapper.getParamNameValuePairs());
    }

    @Test
    void duplicateRouteInheritsEnvironment() {
        Route source = Route.builder().id(1L).routeName("api").routeType("BACKEND")
                .path("/api").upstreamUrl("http://api").environment("staging").build();
        when(routeMapper.selectById(1L)).thenReturn(source);
        when(routeMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(routeMapper.insert(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(202L);
            return 1;
        });
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        Route copy = routeService.duplicateRoute(1L);

        assertEquals("staging", copy.getEnvironment(), "副本留在源路由环境内");
    }

    @Test
    void normalizeEnvironmentHandlesNullBlankAndTrims() {
        assertEquals("default", RouteService.normalizeEnvironment(null));
        assertEquals("default", RouteService.normalizeEnvironment("  "));
        assertEquals("prod", RouteService.normalizeEnvironment(" prod "));
    }
}
