package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.admin.mapper.RouteCanvasMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCanvas;
import fun.commons.gateway4j.common.util.JsonUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class RouteCanvasService extends ServiceImpl<RouteCanvasMapper, RouteCanvas> {

    private static final int DISPATCH_X = 420;
    private static final int DISPATCH_Y = 60;
    private static final int CHILD_Y = 220;
    private static final int CHILD_X_SPACING = 260;

    private final RouteService routeService;

    public RouteCanvasService(RouteService routeService) {
        this.routeService = routeService;
    }

    public RouteCanvas getCanvas(Long routeId) {
        Route route = routeService.getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        RouteCanvas canvas = getBaseMapper().selectOne(new LambdaQueryWrapper<RouteCanvas>()
                .eq(RouteCanvas::getRouteId, routeId));
        if (canvas != null) {
            return canvas;
        }
        // 修复 D7：无持久化画布时从路由树即时推导（与画布/路由树同源），不落库
        return RouteCanvas.builder()
                .routeId(routeId)
                .canvasData(deriveCanvasData(route))
                .build();
    }

    @Transactional
    public void saveCanvas(Long routeId, String canvasData) {
        Route route = routeService.getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        RouteCanvas existing = getBaseMapper().selectOne(new LambdaQueryWrapper<RouteCanvas>()
                .eq(RouteCanvas::getRouteId, routeId));
        if (existing == null) {
            RouteCanvas canvas = RouteCanvas.builder()
                    .routeId(routeId)
                    .canvasData(canvasData != null ? canvasData : "{}")
                    .build();
            save(canvas);
        } else {
            existing.setCanvasData(canvasData != null ? canvasData : "{}");
            updateById(existing);
        }
    }

    /**
     * 从路由树推导画布数据（形状与前端 Canvas.vue 的 nodes/edges 一致）：
     * DISPATCH → 本节点 + 每个后置子路由节点（y=220 横向排布），edges = dispatch→child；
     * 非 DISPATCH → 空节点数组（前端显示空态引导）。
     */
    private String deriveCanvasData(Route route) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        if ("DISPATCH".equals(route.getRouteType())) {
            nodes.add(node(String.valueOf(route.getId()), "DISPATCH", DISPATCH_X, DISPATCH_Y,
                    route.getRouteName()));
            List<Route> children = routeService.listChildren(route.getId());
            int startX = DISPATCH_X - (children.size() - 1) * CHILD_X_SPACING / 2;
            for (int i = 0; i < children.size(); i++) {
                Route child = children.get(i);
                String childId = String.valueOf(child.getId());
                nodes.add(node(childId, "BACKEND", startX + i * CHILD_X_SPACING, CHILD_Y,
                        child.getRouteName()));
                Map<String, Object> edge = new LinkedHashMap<>();
                edge.put("id", "e-" + route.getId() + "-" + childId);
                edge.put("source", String.valueOf(route.getId()));
                edge.put("target", childId);
                edge.put("data", new LinkedHashMap<>());
                edges.add(edge);
            }
        }
        Map<String, Object> canvasMap = new LinkedHashMap<>();
        canvasMap.put("nodes", nodes);
        canvasMap.put("edges", edges);
        return JsonUtils.toCompactJson(canvasMap);
    }

    private Map<String, Object> node(String id, String type, int x, int y, String label) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("label", label != null ? label : id);
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("type", type);
        node.put("position", Map.of("x", x, "y", y));
        node.put("data", data);
        return node;
    }
}
