package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.DictService;
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
class DictControllerTest {

    @Mock private DictService dictService;
    @InjectMocks private DictController controller;

    @Test
    void getDictRouteType() {
        when(dictService.getDict("ROUTE_TYPE")).thenReturn(List.of(
                Map.of("value", "DISPATCH", "label", "分发路由")));
        List<Map<String, String>> result = controller.getDict("ROUTE_TYPE");
        assertEquals(1, result.size());
        assertEquals("DISPATCH", result.get(0).get("value"));
        verify(dictService).getDict("ROUTE_TYPE");
    }
}
