package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.PluginRuntimeStatusService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PluginRuntimeStatusControllerTest {

    @Mock private PluginRuntimeStatusService pluginRuntimeStatusService;
    @InjectMocks private PluginRuntimeStatusController controller;

    @Test
    void runtimeStatusWrappedInSuccessEnvelope() {
        Map<String, Object> data = Map.of("available", true,
                "items", List.of(Map.of("plugin_id", "security", "phase", "PRE", "registered", true, "updated_at", 1L)));
        when(pluginRuntimeStatusService.readRuntimeStatus()).thenReturn(data);

        ApiResponse<Map<String, Object>> resp = controller.runtimeStatus();

        assertEquals(0, resp.getCode());
        assertSame(data, resp.getData());
        verify(pluginRuntimeStatusService).readRuntimeStatus();
    }

    @Test
    void unknownStateStillReturnsSuccessEnvelopeWithAvailableFalse() {
        Map<String, Object> data = Map.of("available", false, "items", List.of());
        when(pluginRuntimeStatusService.readRuntimeStatus()).thenReturn(data);

        ApiResponse<Map<String, Object>> resp = controller.runtimeStatus();

        // 绝不 500：状态未知也是 code=0 + available=false
        assertEquals(0, resp.getCode());
        assertEquals(Boolean.FALSE, resp.getData().get("available"));
        assertTrue(((List<?>) resp.getData().get("items")).isEmpty());
    }
}
