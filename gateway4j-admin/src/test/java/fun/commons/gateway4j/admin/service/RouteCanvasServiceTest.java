package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.RouteCanvasMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCanvas;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class RouteCanvasServiceTest {

    @Mock private RouteCanvasMapper canvasMapper;
    @Mock private RouteService routeService;

    private RouteCanvasService canvasService;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        canvasService = new RouteCanvasService(routeService);
        setBaseMapper(canvasService, canvasMapper);
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
    void getCanvasRouteNotFound() {
        when(routeService.getById(1L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> canvasService.getCanvas(1L));
    }

    @Test
    void getCanvasReturnsExisting() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        RouteCanvas existing = RouteCanvas.builder().id(5L).routeId(1L).canvasData("{\"nodes\":[]}").build();
        when(canvasMapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(existing);
        RouteCanvas result = canvasService.getCanvas(1L);
        assertEquals(5L, result.getId());
        assertEquals("{\"nodes\":[]}", result.getCanvasData());
    }

    @Test
    void getCanvasCreatesDefaultWhenAbsent() {
        // D7：无画布记录时从路由树即时推导（非分发路由 → 空节点数组），不落库
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).routeType("BACKEND").build());
        when(canvasMapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(null);
        RouteCanvas result = canvasService.getCanvas(1L);
        assertEquals(1L, result.getRouteId());
        assertEquals("{\"nodes\":[],\"edges\":[]}", result.getCanvasData());
        verify(canvasMapper, never()).insert(any(RouteCanvas.class));
    }

    @Test
    void getCanvasDerivesDispatchTreeWhenAbsent() {
        // D7：分发路由 → 本节点 + 各后置子路由节点 + dispatch→child 连线
        when(routeService.getById(-100L)).thenReturn(Route.builder()
                .id(-100L).routeName("api_gateway").routeType("DISPATCH").build());
        when(routeService.listChildren(-100L)).thenReturn(List.of(
                Route.builder().id(-101L).routeName("user_service").routeType("BACKEND").build(),
                Route.builder().id(-102L).routeName("order_service").routeType("BACKEND").build()));
        when(canvasMapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(null);

        RouteCanvas result = canvasService.getCanvas(-100L);
        var canvas = fun.commons.gateway4j.common.util.JsonUtils.parseObject(result.getCanvasData(), Map.class);
        var nodes = (List<?>) canvas.get("nodes");
        var edges = (List<?>) canvas.get("edges");
        assertEquals(3, nodes.size());
        assertEquals(2, edges.size());
        assertEquals("-100", ((Map<?, ?>) nodes.get(0)).get("id"));
        assertEquals("DISPATCH", ((Map<?, ?>) nodes.get(0)).get("type"));
        assertEquals("-101", ((Map<?, ?>) nodes.get(1)).get("id"));
        assertEquals("BACKEND", ((Map<?, ?>) nodes.get(1)).get("type"));
        assertEquals("e--100--101", ((Map<?, ?>) edges.get(0)).get("id"));
        verify(canvasMapper, never()).insert(any(RouteCanvas.class));
    }

    @Test
    void saveCanvasInsertsWhenAbsent() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        when(canvasMapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(null);
        when(canvasMapper.insert(any(RouteCanvas.class))).thenReturn(1);
        canvasService.saveCanvas(1L, "{\"nodes\":[]}");
        verify(canvasMapper).insert(any(RouteCanvas.class));
    }

    @Test
    void saveCanvasUpdatesWhenPresent() {
        when(routeService.getById(1L)).thenReturn(Route.builder().id(1L).build());
        RouteCanvas existing = RouteCanvas.builder().id(5L).routeId(1L).canvasData("{}").build();
        when(canvasMapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(existing);
        when(canvasMapper.updateById(any(RouteCanvas.class))).thenReturn(1);
        canvasService.saveCanvas(1L, "{\"nodes\":[1]}");
        verify(canvasMapper).updateById(any(RouteCanvas.class));
        assertEquals("{\"nodes\":[1]}", existing.getCanvasData());
    }
}
