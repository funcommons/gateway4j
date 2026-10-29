package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RouteTransferServiceTest {

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private PluginMapper pluginMapper;

    private RouteTransferService transferService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        transferService = new RouteTransferService(routeService, conditionMapper, bindingMapper,
                pluginMapper, new RouteValidator());
    }

    // ==================== 导出 ====================

    @Test
    void exportEmpty() {
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of());
        RoutePackage pkg = transferService.exportRoutes(null, null);
        assertEquals("1.0", pkg.version());
        assertTrue(pkg.routes().isEmpty());
    }

    @Test
    void exportBackendRoute() {
        Route backend = Route.builder().id(1L).routeName("b1").routeType("BACKEND")
                .path("/api/a").upstreamUrl("http://a:8080").sortOrder(0).build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(backend));
        when(routeService.listByIds(anySet())).thenReturn(List.of(backend));
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RoutePackage pkg = transferService.exportRoutes(null, null);
        assertEquals(1, pkg.routes().size());
        RoutePackage.RouteNode node = pkg.routes().get(0);
        assertEquals("b1", node.routeName());
        assertEquals("BACKEND", node.routeType());
        assertEquals("/api/a", node.path());
    }

    @Test
    void exportDispatchWithConditionAndPlugin() {
        Route dispatch = Route.builder().id(1L).routeName("d1").routeType("DISPATCH").build();
        Route backend = Route.builder().id(2L).routeName("b1").routeType("BACKEND")
                .path("/api/a").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(dispatch, backend));
        when(routeService.listByIds(anySet())).thenReturn(List.of(dispatch, backend));
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RouteCondition.builder().routeId(1L).conditionType("HEADER").operator("EQ")
                        .conditionKey("X-V").conditionValue("2").targetRouteId(2L).priority(0).build()));
        Plugin jwt = Plugin.builder().id(10L).pluginId("jwt").pluginName("JWT").build();
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(
                RoutePluginBinding.builder().routeId(1L).pluginId(10L).sortOrder(0)
                        .bindingConfig("{\"k\":1}").build()));
        when(pluginMapper.selectByIds(anyList())).thenReturn(List.of(jwt));

        RoutePackage pkg = transferService.exportRoutes(null, null);
        RoutePackage.RouteNode node = pkg.routes().stream()
                .filter(n -> "d1".equals(n.routeName())).findFirst().orElseThrow();
        assertEquals(1, node.conditions().size());
        assertEquals("b1", node.conditions().get(0).targetRouteKey());
        assertEquals(1, node.plugins().size());
        assertEquals("jwt", node.plugins().get(0).pluginId());
        assertEquals("{\"k\":1}", node.plugins().get(0).bindingConfig());
    }

    @Test
    void exportNestedChildren() {
        Route parent = Route.builder().id(1L).routeName("p").routeType("DISPATCH").build();
        Route child = Route.builder().id(2L).routeName("c").routeType("BACKEND")
                .parentRouteId(1L).path("/api/c").build();
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(parent, child));
        when(routeService.listByIds(anySet())).thenReturn(List.of(parent, child));
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RoutePackage pkg = transferService.exportRoutes(null, null);
        assertEquals(1, pkg.routes().size());
        assertEquals(1, pkg.routes().get(0).children().size());
        assertEquals("c", pkg.routes().get(0).children().get(0).routeName());
    }

    // ==================== 导入 ====================

    @Test
    void importNullPackageThrows() {
        assertThrows(BusinessException.class, () -> transferService.importRoutes(null, "SKIP"));
    }

    @Test
    void importInvalidStrategyThrows() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        assertThrows(BusinessException.class, () -> transferService.importRoutes(pkg, "BAD"));
    }

    @Test
    void importCreatesNewRoute() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node));

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(100L);
            return true;
        });
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP");
        assertEquals(1, result.get("total"));
        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("updated"));
        assertEquals(0, result.get("skipped"));
        verify(routeService).save(any(Route.class));
    }

    @Test
    void importSkipsExistingWithSkipStrategy() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node));

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false)))
                .thenReturn(Route.builder().id(50L).routeName("b1").build());
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP");
        assertEquals(1, result.get("skipped"));
        assertEquals(0, result.get("created"));
        verify(routeService, never()).save(any(Route.class));
    }

    @Test
    void importErrorStrategyReportsConflict() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node));

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false)))
                .thenReturn(Route.builder().id(50L).routeName("b1").build());
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "ERROR");
        assertEquals(1, ((List<?>) result.get("errors")).size());
        assertEquals(0, result.get("created"));
    }

    @Test
    void importOverwriteUpdatesExisting() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/new", "http://new:8080", 1, "new remark",
                List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node));

        Route existing = Route.builder().id(50L).routeName("b1").path("/api/old").build();
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(existing);
        when(routeService.updateById(any(Route.class))).thenReturn(true);
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "OVERWRITE");
        assertEquals(1, result.get("updated"));
        assertEquals("/api/new", existing.getPath());
        assertEquals("DRAFT", existing.getStatus());
        verify(conditionMapper).delete(any(LambdaQueryWrapper.class));
        verify(bindingMapper).delete(any(LambdaQueryWrapper.class));
    }

    @Test
    void importWiresConditionsAndPlugins() {
        RoutePackage.ConditionNode cond = new RoutePackage.ConditionNode(
                "HEADER", "EQ", "X-V", "2", "backend", 0);
        RoutePackage.PluginNode plugin = new RoutePackage.PluginNode("jwt", "{}", 0);
        RoutePackage.RouteNode dispatch = new RoutePackage.RouteNode(
                "dispatch", "DISPATCH", null, null, 0, null,
                List.of(cond), List.of(plugin), List.of());
        RoutePackage.RouteNode backend = new RoutePackage.RouteNode(
                "backend", "BACKEND", "/api/a", "http://a:8080", 0, null,
                List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(dispatch, backend));

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        long[] nextId = {100L};
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(nextId[0]++);
            return true;
        });
        Plugin jwt = Plugin.builder().id(10L).pluginId("jwt").build();
        when(pluginMapper.selectList(null)).thenReturn(List.of(jwt));

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP");
        assertEquals(2, result.get("created"));
        assertTrue(((List<?>) result.get("errors")).isEmpty());
        verify(conditionMapper).insert(argThat((RouteCondition c) ->
                c.getTargetRouteId() != null && "HEADER".equals(c.getConditionType())));
        verify(bindingMapper).insert(argThat((RoutePluginBinding b) ->
                b.getPluginId().equals(10L)));
    }

    @Test
    void importReportsMissingPlugin() {
        RoutePackage.PluginNode plugin = new RoutePackage.PluginNode("nope", "{}", 0);
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null,
                List.of(), List.of(plugin), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node));

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(100L);
            return true;
        });
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP");
        assertEquals(1, ((List<?>) result.get("errors")).size());
        assertTrue(((List<?>) result.get("errors")).get(0).toString().contains("nope"));
    }

    // ==================== 预检 ====================

    @Test
    void validateCleanPackage() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);

        Map<String, Object> result = transferService.validateImport(new RoutePackage("1.0", 0L, List.of(node)));
        assertEquals(true, result.get("is_valid"));
        assertTrue(((List<?>) result.get("conflicts")).isEmpty());
    }

    @Test
    void validateDetectsConflict() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false)))
                .thenReturn(Route.builder().id(1L).routeName("b1").build());

        Map<String, Object> result = transferService.validateImport(new RoutePackage("1.0", 0L, List.of(node)));
        assertEquals(List.of("b1"), result.get("conflicts"));
    }

    @Test
    void validateDetectsMissingPluginAndTarget() {
        RoutePackage.ConditionNode cond = new RoutePackage.ConditionNode(
                "HEADER", "EQ", "X-V", "2", "ghost-route", 0);
        RoutePackage.PluginNode plugin = new RoutePackage.PluginNode("ghost-plugin", "{}", 0);
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "d1", "DISPATCH", null, null, 0, null, List.of(cond), List.of(plugin), List.of());
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(pluginMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        Map<String, Object> result = transferService.validateImport(new RoutePackage("1.0", 0L, List.of(node)));
        assertEquals(false, result.get("is_valid"));
        assertEquals(List.of("ghost-plugin"), result.get("missing_plugins"));
        assertEquals(List.of("ghost-route"), result.get("missing_targets"));
    }

    @Test
    void validateDetectsCycle() {
        RoutePackage.ConditionNode toB = new RoutePackage.ConditionNode("HEADER", "EQ", "X", "1", "b", 0);
        RoutePackage.ConditionNode toA = new RoutePackage.ConditionNode("HEADER", "EQ", "X", "2", "a", 0);
        RoutePackage.RouteNode a = new RoutePackage.RouteNode("a", "DISPATCH", null, null, 0, null,
                List.of(toB), List.of(), List.of());
        RoutePackage.RouteNode b = new RoutePackage.RouteNode("b", "DISPATCH", null, null, 0, null,
                List.of(toA), List.of(), List.of());
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);

        Map<String, Object> result = transferService.validateImport(new RoutePackage("1.0", 0L, List.of(a, b)));
        assertEquals(false, result.get("is_valid"));
        assertFalse(((List<?>) result.get("cycle_warnings")).isEmpty());
    }

    // ==================== P2-2 多环境：导出指纹 / 导入目标环境 / 旧包兼容 ====================

    private Route envRoute(long id, String name, String environment) {
        Route r = Route.builder().id(id).routeName(name).routeType("BACKEND")
                .path("/" + name).upstreamUrl("http://" + name).sortOrder(0).build();
        r.setEnvironment(environment);
        return r;
    }

    @Test
    void exportSingleEnvironmentFingerprint() {
        when(routeService.listRoutes(null, null, null)).thenReturn(List.of(envRoute(1L, "b1", "default")));
        when(routeService.listByIds(anySet())).thenReturn(List.of(envRoute(1L, "b1", "default")));
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RoutePackage pkg = transferService.exportRoutes(null, null);
        assertEquals("default", pkg.environment(), "单环境导出指纹为该环境标识");
    }

    @Test
    void exportMixedEnvironmentFingerprint() {
        when(routeService.listRoutes(null, null, null))
                .thenReturn(List.of(envRoute(1L, "b1", "default"), envRoute(2L, "b2", "staging")));
        when(routeService.listByIds(anySet()))
                .thenReturn(List.of(envRoute(1L, "b1", "default"), envRoute(2L, "b2", "staging")));
        when(conditionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RoutePackage pkg = transferService.exportRoutes(null, null);
        assertEquals("mixed", pkg.environment(), "混合环境导出指纹为 mixed");
    }

    @Test
    void importLegacyPackageWithoutEnvironmentLandsInDefault() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "legacy", "BACKEND", "/api/l", "http://l:8080", 0, null, List.of(), List.of(), List.of());
        // 旧包：environment 组件为 null（Jackson 反序列化旧 JSON 的等价形态）
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node), null);

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(300L);
            return true;
        });
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP");
        assertEquals(1, result.get("created"));
        assertEquals("default", result.get("environment"), "旧包目标环境 = default");
        assertEquals("default", result.get("package_environment"));
        org.mockito.ArgumentCaptor<Route> captor = org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeService).save(captor.capture());
        assertEquals("default", captor.getValue().getEnvironment(), "旧包导入落 default 环境");
    }

    @Test
    void importWithTargetEnvironmentCreatesInThatEnvironment() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "stg", "BACKEND", "/api/s", "http://s:8080", 0, null, List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node), "default");

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(301L);
            return true;
        });
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP", "staging");
        assertEquals("staging", result.get("environment"), "目标环境取请求参数");
        org.mockito.ArgumentCaptor<Route> captor = org.mockito.ArgumentCaptor.forClass(Route.class);
        verify(routeService).save(captor.capture());
        assertEquals("staging", captor.getValue().getEnvironment());
    }

    @Test
    void importSameNameInDifferentEnvironmentTreatedAsNew() {
        // default 环境已有 b1；导入目标 staging → 同名视为新增
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of(node), "default");

        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);
        when(routeService.save(any(Route.class))).thenAnswer(inv -> {
            inv.getArgument(0, Route.class).setId(302L);
            return true;
        });
        when(pluginMapper.selectList(null)).thenReturn(List.of());

        Map<String, Object> result = transferService.importRoutes(pkg, "SKIP", "staging");
        assertEquals(1, result.get("created"), "环境不同即视为新增");
        assertEquals(0, result.get("skipped"));
    }

    @Test
    void importRejectsInvalidTargetEnvironment() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        assertThrows(BusinessException.class,
                () -> transferService.importRoutes(pkg, "SKIP", "INVALID ENV"));
    }

    @Test
    void validateImportShowsTargetAndPackageEnvironment() {
        RoutePackage.RouteNode node = new RoutePackage.RouteNode(
                "b1", "BACKEND", "/api/a", "http://a:8080", 0, null, List.of(), List.of(), List.of());
        when(routeService.getOne(any(LambdaQueryWrapper.class), eq(false))).thenReturn(null);

        // 旧包 + 缺省目标：environment=default，package_environment=default
        Map<String, Object> legacy = transferService.validateImport(new RoutePackage("1.0", 0L, List.of(node)));
        assertEquals("default", legacy.get("environment"));
        assertEquals("default", legacy.get("package_environment"));

        // 旧包 + 指定目标 staging：conflicts 按 staging 环境内比对
        Map<String, Object> targeted = transferService.validateImport(
                new RoutePackage("1.0", 0L, List.of(node), null), "staging");
        assertEquals("staging", targeted.get("environment"));
        assertEquals("default", targeted.get("package_environment"));
        assertTrue(((List<?>) targeted.get("conflicts")).isEmpty(),
                "default 环境的同名路由不应算入 staging 的 conflicts");
    }

    @Test
    void exportEmptyWithEnvironmentFilterCarriesFingerprint() {
        when(routeService.listRoutes(null, null, null, null, "staging")).thenReturn(List.of());
        RoutePackage pkg = transferService.exportRoutes(null, null, "staging");
        assertEquals("staging", pkg.environment());
        assertTrue(pkg.routes().isEmpty());
    }
}
