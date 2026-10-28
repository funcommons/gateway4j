package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.signature.annotation.RequiresSignature;
import fun.commons.gateway4j.admin.service.RoutePackage;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteTransferService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 开放 API（三方系统直连）。使用 HMAC 签名认证（appKey/appSecret），
 * 供三方平台以编程方式管理路由，无需登录控制台。
 */
@RestController
@RequestMapping("/v1/open")
@RequiresSignature
public class OpenApiController {

    private final RouteTransferService routeTransferService;
    private final RouteService routeService;

    public OpenApiController(RouteTransferService routeTransferService, RouteService routeService) {
        this.routeTransferService = routeTransferService;
        this.routeService = routeService;
    }

    @GetMapping("/routes/export")
    public RoutePackage exportRoutes(@RequestParam(required = false) List<Long> routeIds,
                                     @RequestParam(required = false) String status) {
        return routeTransferService.exportRoutes(routeIds, status);
    }

    @PostMapping("/routes/import")
    public Map<String, Object> importRoutes(@RequestBody ImportRequest request) {
        return routeTransferService.importRoutes(request.data(), request.strategy());
    }

    @PostMapping("/routes/import/validate")
    public Map<String, Object> validateImport(@RequestBody RoutePackage data) {
        return routeTransferService.validateImport(data);
    }

    @PostMapping("/routes/{id}/publish")
    public Map<String, Object> publishRoute(@PathVariable Long id) {
        routeService.publishRoute(id);
        return Map.of("route_id", String.valueOf(id), "status", "PUBLISHED");
    }

    @PostMapping("/routes/{id}/offline")
    public Map<String, Object> offlineRoute(@PathVariable Long id) {
        routeService.offlineRoute(id);
        return Map.of("route_id", String.valueOf(id), "status", "OFFLINE");
    }

    public record ImportRequest(RoutePackage data, String strategy) {}
}
