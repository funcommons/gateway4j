package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RouteBindingServiceTest {

    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private RouteService routeService;
    @Mock private PluginService pluginService;

    private RouteBindingService bindingService;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        bindingService = new RouteBindingService(routeService, pluginService);
        setBaseMapper(bindingService, bindingMapper);
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
    void listBindingsRouteNotFound() {
        when(routeService.getById(1L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> bindingService.listBindings(1L));
    }

    @Test
    void listBindingsEmpty() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        List<Map<String, Object>> result = bindingService.listBindings(1L);
        assertTrue(result.isEmpty());
    }

    @Test
    void listBindingsWithPlugin() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        RoutePluginBinding b = RoutePluginBinding.builder().id(9L).routeId(1L).pluginId(3L).sortOrder(0).build();
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(b));
        when(pluginService.listByIds(any())).thenReturn(List.of(
                Plugin.builder().id(3L).pluginName("jwt").pluginPhase("PRE").build()));
        List<Map<String, Object>> result = bindingService.listBindings(1L);
        assertEquals(1, result.size());
        assertEquals("9", result.get(0).get("binding_id"));
        assertEquals("jwt", result.get(0).get("plugin_name"));
    }

    @Test
    void bindPluginRouteNotFound() {
        when(routeService.getById(1L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> bindingService.bindPlugin(1L, 3L, "{}"));
    }

    @Test
    void bindPluginPluginNotFound() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        when(pluginService.getById(3L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> bindingService.bindPlugin(1L, 3L, "{}"));
    }

    @Test
    void bindPluginSuccess() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        when(pluginService.getById(3L)).thenReturn(Plugin.builder().id(3L).build());
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(bindingMapper.insert(any(RoutePluginBinding.class))).thenAnswer(inv -> {
            inv.getArgument(0, RoutePluginBinding.class).setId(9L);
            return 1;
        });
        RoutePluginBinding result = bindingService.bindPlugin(1L, 3L, "{\"a\":1}");
        assertEquals(9L, result.getId());
        assertEquals("{\"a\":1}", result.getBindingConfig());
        assertEquals(0, result.getSortOrder());
    }

    @Test
    void updateBindingNotFound() {
        when(bindingMapper.selectById(9L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> bindingService.updateBinding(1L, 9L, "{}", null));
    }

    @Test
    void updateBindingWrongRoute() {
        RoutePluginBinding b = RoutePluginBinding.builder().id(9L).routeId(2L).build();
        when(bindingMapper.selectById(9L)).thenReturn(b);
        assertThrows(BusinessException.class, () -> bindingService.updateBinding(1L, 9L, "{}", null));
    }

    @Test
    void updateBindingSuccess() {
        RoutePluginBinding b = RoutePluginBinding.builder().id(9L).routeId(1L).sortOrder(0).build();
        when(bindingMapper.selectById(9L)).thenReturn(b);
        when(bindingMapper.updateById(any(RoutePluginBinding.class))).thenReturn(1);
        RoutePluginBinding result = bindingService.updateBinding(1L, 9L, "{\"x\":2}", 3);
        assertEquals("{\"x\":2}", result.getBindingConfig());
        assertEquals(3, result.getSortOrder());
    }

    @Test
    void unbindPluginSuccess() {
        RoutePluginBinding b = RoutePluginBinding.builder().id(9L).routeId(1L).build();
        when(bindingMapper.selectById(9L)).thenReturn(b);
        when(bindingMapper.deleteById(9L)).thenReturn(1);
        bindingService.unbindPlugin(1L, 9L);
        verify(bindingMapper).deleteById(9L);
    }

    @Test
    void getPluginChainNotFound() {
        when(routeService.getById(1L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> bindingService.getPluginChain(1L));
    }

    @Test
    void getPluginChainAssembles() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).routeName("r1").build());
        RoutePluginBinding preB = RoutePluginBinding.builder().id(9L).routeId(1L).pluginId(3L).sortOrder(0).build();
        RoutePluginBinding postB = RoutePluginBinding.builder().id(10L).routeId(1L).pluginId(4L).sortOrder(0).build();
        when(bindingMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(preB, postB));
        when(pluginService.listByIds(any())).thenReturn(List.of(
                Plugin.builder().id(3L).pluginName("jwt").pluginPhase("PRE").scope("ROUTE").status("ENABLED").build(),
                Plugin.builder().id(4L).pluginName("logging").pluginPhase("POST").scope("ROUTE").status("ENABLED").build()));
        when(pluginService.listGlobalPlugins("PRE")).thenReturn(List.of());
        when(pluginService.listGlobalPlugins("POST")).thenReturn(List.of());

        Map<String, Object> result = bindingService.getPluginChain(1L);
        assertEquals("1", result.get("route_id"));
        assertEquals(1, ((List<?>) result.get("pre_chain")).size());
        assertEquals(1, ((List<?>) result.get("post_chain")).size());
    }
}
