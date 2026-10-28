package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.RoutePackage;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
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
class OpenApiControllerTest {

    @Mock private RouteTransferService routeTransferService;
    @Mock private RouteService routeService;
    @InjectMocks private OpenApiController controller;

    @Test
    void exportRoutes() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.exportRoutes(null, "PUBLISHED")).thenReturn(pkg);
        RoutePackage result = controller.exportRoutes(null, "PUBLISHED");
        assertEquals("1.0", result.version());
        verify(routeTransferService).exportRoutes(null, "PUBLISHED");
    }

    @Test
    void importRoutes() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.importRoutes(pkg, "OVERWRITE")).thenReturn(Map.of("total", 0, "created", 0));
        Map<String, Object> result = controller.importRoutes(
                new OpenApiController.ImportRequest(pkg, "OVERWRITE"));
        assertEquals(0, result.get("total"));
        verify(routeTransferService).importRoutes(pkg, "OVERWRITE");
    }

    @Test
    void validateImport() {
        RoutePackage pkg = new RoutePackage("1.0", 0L, List.of());
        when(routeTransferService.validateImport(pkg)).thenReturn(Map.of("is_valid", true));
        Map<String, Object> result = controller.validateImport(pkg);
        assertEquals(true, result.get("is_valid"));
    }

    @Test
    void publishRoute() {
        Map<String, Object> result = controller.publishRoute(1L);
        assertEquals("PUBLISHED", result.get("status"));
        verify(routeService).publishRoute(1L);
    }

    @Test
    void offlineRoute() {
        Map<String, Object> result = controller.offlineRoute(1L);
        assertEquals("OFFLINE", result.get("status"));
        verify(routeService).offlineRoute(1L);
    }
}
