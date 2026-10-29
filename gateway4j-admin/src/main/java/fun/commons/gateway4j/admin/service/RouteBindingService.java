package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class RouteBindingService extends ServiceImpl<RoutePluginBindingMapper, RoutePluginBinding> {

    private final RouteService routeService;
    private final PluginService pluginService;

    public RouteBindingService(RouteService routeService, PluginService pluginService) {
        this.routeService = routeService;
        this.pluginService = pluginService;
    }

    public List<Map<String, Object>> listBindings(Long routeId) {
        Route route = routeService.getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        List<RoutePluginBinding> bindings = list(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId)
                .orderByAsc(RoutePluginBinding::getSortOrder));
        List<Long> pluginIds = bindings.stream().map(RoutePluginBinding::getPluginId).toList();
        Map<Long, Plugin> pluginMap = pluginIds.isEmpty() ? Map.of()
                : pluginService.listByIds(pluginIds).stream()
                .collect(Collectors.toMap(Plugin::getId, p -> p));
        List<Map<String, Object>> result = new ArrayList<>();
        for (RoutePluginBinding b : bindings) {
            Plugin p = pluginMap.get(b.getPluginId());
            result.add(Map.of(
                    "binding_id", String.valueOf(b.getId()),
                    "route_id", String.valueOf(b.getRouteId()),
                    "plugin_id", String.valueOf(b.getPluginId()),
                    "plugin_name", p != null ? p.getPluginName() : "",
                    "plugin_phase", p != null ? p.getPluginPhase() : "",
                    "sort_order", b.getSortOrder(),
                    "binding_config", b.getBindingConfig() != null ? b.getBindingConfig() : "{}"
            ));
        }
        return result;
    }

    @Transactional
    public RoutePluginBinding bindPlugin(Long routeId, Long pluginId, String bindingConfig) {
        Route route = routeService.getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        Plugin plugin = pluginService.getById(pluginId);
        if (plugin == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        Integer maxOrder = getBaseMapper().selectList(new LambdaQueryWrapper<RoutePluginBinding>()
                        .eq(RoutePluginBinding::getRouteId, routeId)
                        .orderByDesc(RoutePluginBinding::getSortOrder)
                        .last("LIMIT 1"))
                .stream().findFirst().map(RoutePluginBinding::getSortOrder).orElse(-1);
        RoutePluginBinding binding = RoutePluginBinding.builder()
                .routeId(routeId)
                .pluginId(pluginId)
                .sortOrder(maxOrder + 1)
                .bindingConfig(bindingConfig != null ? bindingConfig : "{}")
                .build();
        save(binding);
        return binding;
    }

    @Transactional
    public RoutePluginBinding updateBinding(Long routeId, Long bindingId, String bindingConfig, Integer sortOrder) {
        RoutePluginBinding existing = getById(bindingId);
        if (existing == null || !existing.getRouteId().equals(routeId)) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "绑定不存在或不属于该路由");
        }
        if (bindingConfig != null) existing.setBindingConfig(bindingConfig);
        if (sortOrder != null) existing.setSortOrder(sortOrder);
        updateById(existing);
        return existing;
    }

    @Transactional
    public void unbindPlugin(Long routeId, Long bindingId) {
        RoutePluginBinding existing = getById(bindingId);
        if (existing == null || !existing.getRouteId().equals(routeId)) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "绑定不存在或不属于该路由");
        }
        removeById(bindingId);
    }

    @Transactional
    public void sortBindings(Long routeId, String pluginPhase, List<Long> bindingIds) {
        if (bindingIds == null || bindingIds.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "binding_ids 不能为空");
        }
        int order = 0;
        for (Long bindingId : bindingIds) {
            RoutePluginBinding binding = getById(bindingId);
            if (binding != null && binding.getRouteId().equals(routeId)) {
                binding.setSortOrder(order++);
                updateById(binding);
            }
        }
    }

    public Map<String, Object> getPluginChain(Long routeId) {
        Route route = routeService.getById(routeId);
        if (route == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }
        List<RoutePluginBinding> routeBindings = list(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getRouteId, routeId)
                .orderByAsc(RoutePluginBinding::getSortOrder));
        List<Long> pluginIds = routeBindings.stream().map(RoutePluginBinding::getPluginId).toList();
        Map<Long, Plugin> routePluginMap = pluginIds.isEmpty() ? Map.of()
                : pluginService.listByIds(pluginIds).stream()
                .collect(Collectors.toMap(Plugin::getId, p -> p));

        List<Plugin> globalPre = pluginService.listGlobalPlugins("PRE");
        List<Plugin> globalPost = pluginService.listGlobalPlugins("POST");

        List<Map<String, Object>> preChain = new ArrayList<>();
        List<Map<String, Object>> postChain = new ArrayList<>();

        for (Plugin p : globalPre) {
            preChain.add(chainItem(p, null));
        }
        for (RoutePluginBinding b : routeBindings) {
            Plugin p = routePluginMap.get(b.getPluginId());
            if (p != null && "PRE".equals(p.getPluginPhase()) && "ENABLED".equals(p.getStatus())) {
                preChain.add(chainItem(p, b));
            }
        }

        List<RoutePluginBinding> postBindings = routeBindings.stream()
                .filter(b -> {
                    Plugin p = routePluginMap.get(b.getPluginId());
                    return p != null && "POST".equals(p.getPluginPhase()) && "ENABLED".equals(p.getStatus());
                })
                .sorted((a, b2) -> Integer.compare(b2.getSortOrder(), a.getSortOrder()))
                .toList();
        for (RoutePluginBinding b : postBindings) {
            Plugin p = routePluginMap.get(b.getPluginId());
            postChain.add(chainItem(p, b));
        }
        for (Plugin p : globalPost) {
            postChain.add(chainItem(p, null));
        }

        return Map.of(
                "route_id", String.valueOf(routeId),
                "route_name", route.getRouteName(),
                "pre_chain", preChain,
                "post_chain", postChain
        );
    }

    private Map<String, Object> chainItem(Plugin p, RoutePluginBinding b) {
        return Map.of(
                "plugin_id", String.valueOf(p.getId()),
                "plugin_name", p.getPluginName(),
                "scope", p.getScope(),
                "sort_order", b != null ? b.getSortOrder() : p.getSortOrder(),
                "binding_config", b != null ? (b.getBindingConfig() != null ? b.getBindingConfig() : "{}") : "{}"
        );
    }
}
