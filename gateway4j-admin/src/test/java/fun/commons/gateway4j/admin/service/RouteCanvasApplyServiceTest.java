package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.RouteConditionMapper;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService.CanvasApplyRequest;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService.CanvasEdgeDataDto;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService.CanvasEdgeDto;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService.CanvasNodeDataDto;
import fun.commons.gateway4j.admin.service.RouteCanvasApplyService.CanvasNodeDto;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RouteCanvasApplyServiceTest {

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;

    private RouteCanvasApplyService service;

    private Route parent;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new RouteCanvasApplyService(routeService, conditionMapper);
        parent = Route.builder().id(100L).routeName("dispatch").routeType("DISPATCH")
                .status("DRAFT").build();
    }

    private CanvasNodeDto backendNode(String id, String label, String path, String upstream) {
        return new CanvasNodeDto(id, "BACKEND", new CanvasNodeDataDto(label, path, upstream));
    }

    @Test
    void applyRequiresDispatchParent() {
        when(routeService.getById(100L)).thenReturn(Route.builder().id(100L)
                .routeType("BACKEND").build());
        assertThrows(BusinessException.class, () -> service.applyCanvas(100L,
                new CanvasApplyRequest(List.of(), List.of(), true, null)));
    }

    @Test
    void applyRequiresExistingParent() {
        when(routeService.getById(404L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.applyCanvas(404L,
                new CanvasApplyRequest(List.of(), List.of(), true, null)));
    }

    @Test
    void dryRunReportsDiffWithoutWrites() {
        Route existingChild = Route.builder().id(1L).routeName("users").routeType("BACKEND")
                .path("/old").upstreamUrl("http://old").parentRouteId(100L).build();
        Route removedChild = Route.builder().id(2L).routeName("gone").routeType("BACKEND")
                .parentRouteId(100L).build();
        when(routeService.getById(100L)).thenReturn(parent);
        when(routeService.list(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(existingChild, removedChild));
        when(routeService.list()).thenReturn(List.of(parent, existingChild, removedChild));

        CanvasApplyRequest request = new CanvasApplyRequest(
                List.of(
                        backendNode("1", "users", "/new", "http://new"),
                        backendNode("n_1", "支付", "/pay", "http://pay")),
                List.of(
                        new CanvasEdgeDto("e1", "100", "1",
                                new CanvasEdgeDataDto("HEADER", "X-T", "1", "EQ", 1)),
                        new CanvasEdgeDto("e2", "100", "n_1",
                                new CanvasEdgeDataDto("PATH", null, "/pay", null, 2))),
                true,
                null);

        Map<String, Object> report = service.applyCanvas(100L, request);

        assertEquals(Boolean.TRUE, report.get("dry_run"));
        List<?> toCreate = (List<?>) report.get("to_create");
        assertEquals(1, toCreate.size());
        // 中文 label 规整后为空 → 从节点 id n_1 派生
        assertEquals("n_1", ((Map<?, ?>) toCreate.get(0)).get("route_name"));
        List<?> toUpdate = (List<?>) report.get("to_update");
        assertEquals(1, toUpdate.size());
        assertEquals("1", ((Map<?, ?>) toUpdate.get(0)).get("id"));
        List<?> toDelete = (List<?>) report.get("to_delete");
        assertEquals(1, toDelete.size());
        assertEquals(2, report.get("conditions_changes"));

        verify(routeService, never()).save(any(Route.class));
        verify(routeService, never()).updateById(any(Route.class));
        verify(routeService, never()).deleteRoute(any());
        verify(conditionMapper, never()).insert(any(RouteCondition.class));
        verify(conditionMapper, never()).delete(any(LambdaQueryWrapper.class));
    }

    @Test
    void applyExecutesCreatesUpdatesAndConfirmedDeletes() {
        Route existingChild = Route.builder().id(1L).routeName("users").routeType("BACKEND")
                .path("/old").upstreamUrl("http://old").parentRouteId(100L).build();
        Route removedChild = Route.builder().id(2L).routeName("gone").routeType("BACKEND")
                .parentRouteId(100L).build();
        when(routeService.getById(100L)).thenReturn(parent);
        when(routeService.list(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(existingChild, removedChild));
        when(routeService.list()).thenReturn(List.of(parent, existingChild, removedChild));
        when(routeService.save(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(300L);
            return true;
        });

        CanvasApplyRequest request = new CanvasApplyRequest(
                List.of(
                        backendNode("1", "users", "/new", "http://new"),
                        backendNode("n_1", "pay", "/pay", "http://pay")),
                List.of(
                        new CanvasEdgeDto("e1", "100", "1",
                                new CanvasEdgeDataDto("HEADER", "X-T", "1", "EQ", 1)),
                        new CanvasEdgeDto("e2", "100", "n_1",
                                new CanvasEdgeDataDto("PATH", null, "/pay", null, 2))),
                false,
                List.of(2L));

        Map<String, Object> report = service.applyCanvas(100L, request);

        assertEquals(Boolean.FALSE, report.get("dry_run"));
        assertEquals(List.of("300"), report.get("created_ids"));
        assertEquals(List.of("1"), report.get("updated_ids"));
        assertEquals(List.of("2"), report.get("deleted_ids"));
        verify(routeService).save(any(Route.class));
        verify(routeService).updateById(any(Route.class));
        verify(routeService).deleteRoute(2L);
        // 全量替换：先删旧条件再插新条件
        verify(conditionMapper).delete(any(LambdaQueryWrapper.class));
        ArgumentCaptor<RouteCondition> condCaptor = ArgumentCaptor.forClass(RouteCondition.class);
        verify(conditionMapper, times(2)).insert(condCaptor.capture());
        List<RouteCondition> conds = condCaptor.getAllValues();
        assertEquals(1L, conds.get(0).getTargetRouteId());
        // 新建子路由的 target 在执行后回填
        assertEquals(300L, conds.get(1).getTargetRouteId());
        assertEquals(2, report.get("conditions_changes"));
    }

    @Test
    void deleteWithoutConfirmIsSkipped() {
        Route removedChild = Route.builder().id(2L).routeName("gone").routeType("BACKEND")
                .parentRouteId(100L).build();
        when(routeService.getById(100L)).thenReturn(parent);
        when(routeService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of(removedChild));
        when(routeService.list()).thenReturn(List.of(parent, removedChild));

        Map<String, Object> report = service.applyCanvas(100L, new CanvasApplyRequest(
                List.of(), List.of(), false, null));

        verify(routeService, never()).deleteRoute(any());
        assertEquals(List.of(), report.get("deleted_ids"));
        assertEquals(1, ((List<?>) report.get("to_delete")).size());
    }

    @Test
    void deleteFailureIsReportedNotThrown() {
        Route removedChild = Route.builder().id(2L).routeName("gone").routeType("BACKEND")
                .parentRouteId(100L).build();
        when(routeService.getById(100L)).thenReturn(parent);
        when(routeService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of(removedChild));
        when(routeService.list()).thenReturn(List.of(parent, removedChild));
        doThrow(new BusinessException(fun.commons.gateway4j.common.constant.ErrorCode.CONFIG_SYNC_FAILED,
                "已发布路由不可删除，请先下线")).when(routeService).deleteRoute(2L);

        Map<String, Object> report = service.applyCanvas(100L, new CanvasApplyRequest(
                List.of(), List.of(), false, List.of(2L)));

        assertEquals(List.of(), report.get("deleted_ids"));
        List<?> errors = (List<?>) report.get("errors");
        assertEquals(1, errors.size());
    }
}
