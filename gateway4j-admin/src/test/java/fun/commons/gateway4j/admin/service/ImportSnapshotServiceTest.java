package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.admin.mapper.ImportSnapshotMapper;
import fun.commons.gateway4j.admin.mapper.RouteCanvasMapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.model.ImportSnapshot;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.util.JsonUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * T5（P2-2 遗留）：快照回滚按快照原路由还原 environment（缺省 default）。
 */
class ImportSnapshotServiceTest {

    @Mock private ImportSnapshotMapper snapshotMapper;
    @Mock private RouteService routeService;
    @Mock private RouteMapper routeMapper;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private RouteCanvasMapper canvasMapper;
    @Mock private PluginMapper pluginMapper;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ImportSnapshotService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ImportSnapshotService(snapshotMapper, routeService, routeMapper,
                conditionMapper, bindingMapper, canvasMapper, pluginMapper, eventPublisher);
        when(routeService.save(any(Route.class))).thenAnswer(invocation -> {
            Route r = invocation.getArgument(0);
            r.setId(900L);
            return true;
        });
    }

    private ImportSnapshot snapshotOf(String json) {
        ImportSnapshot snapshot = ImportSnapshot.builder().build();
        snapshot.setId(1L);
        snapshot.setSnapshotData(json);
        return snapshot;
    }

    /** 快照原路由 environment=staging → 回滚还原为 staging（不再落 default）。 */
    @Test
    void rollbackRestoresSnapshotEnvironment() {
        ImportSnapshotService.SnapshotPackage pkg = new ImportSnapshotService.SnapshotPackage(
                "1.1", 0L,
                List.of(new ImportSnapshotService.SnapshotRoute(
                        "api", "BACKEND", "/api", "http://api", "PUBLISHED", 1,
                        null, null, null, "staging", null, null)));
        when(snapshotMapper.selectById(1L)).thenReturn(snapshotOf(JsonUtils.toCompactJson(pkg)));

        Map<String, Object> result = service.rollback(1L);

        assertEquals(1, result.get("restored"));
        ArgumentCaptor<Route> captor = ArgumentCaptor.forClass(Route.class);
        verify(routeService).save(captor.capture());
        assertEquals("staging", captor.getValue().getEnvironment(), "回滚还原快照原路由环境");
        assertEquals("api", captor.getValue().getRouteName());
    }

    /** 旧版快照（无 environment 字段）→ 回滚归一 default，与迁移前行为一致。 */
    @Test
    void rollbackLegacySnapshotWithoutEnvironmentFallsBackToDefault() {
        String legacyJson = "{\"version\":\"1.0\",\"exportedAt\":0,\"routes\":["
                + "{\"routeName\":\"legacy\",\"routeType\":\"BACKEND\",\"path\":\"/legacy\","
                + "\"upstreamUrl\":\"http://legacy\",\"status\":\"DRAFT\",\"sortOrder\":0,"
                + "\"parentRouteName\":null,\"conditions\":null,\"bindings\":null}]}";
        when(snapshotMapper.selectById(1L)).thenReturn(snapshotOf(legacyJson));

        Map<String, Object> result = service.rollback(1L);

        assertEquals(1, result.get("restored"));
        ArgumentCaptor<Route> captor = ArgumentCaptor.forClass(Route.class);
        verify(routeService).save(captor.capture());
        assertEquals("default", captor.getValue().getEnvironment(), "旧快照缺 environment → default");
    }

    /** 快照不存在 → 业务异常。 */
    @Test
    void rollbackMissingSnapshotThrows() {
        when(snapshotMapper.selectById(404L)).thenReturn(null);
        assertThrows(fun.commons.gateway4j.common.exception.BusinessException.class,
                () -> service.rollback(404L));
    }
}
