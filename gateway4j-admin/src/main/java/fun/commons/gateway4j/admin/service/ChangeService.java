package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 变更时间线（阶段二 T5）：联合 gw_route 与 gw_plugin 按 updated_at 倒序。
 * 零新表方案：两表均自带 status/config_version/updated_at。
 */
@Service
public class ChangeService {

    /** limit 上限（契约：≤200）。 */
    public static final int MAX_LIMIT = 200;
    public static final int DEFAULT_LIMIT = 50;

    private final RouteService routeService;
    private final PluginService pluginService;

    public ChangeService(RouteService routeService, PluginService pluginService) {
        this.routeService = routeService;
        this.pluginService = pluginService;
    }

    public List<Map<String, Object>> listChanges(Integer limitParam) {
        int limit = limitParam == null ? DEFAULT_LIMIT : limitParam;
        if (limit < 1) {
            limit = DEFAULT_LIMIT;
        }
        if (limit > MAX_LIMIT) {
            limit = MAX_LIMIT;
        }

        List<Map<String, Object>> merged = new ArrayList<>();
        for (Route r : routeService.list(new LambdaQueryWrapper<Route>()
                .orderByDesc(Route::getUpdatedAt)
                .last("LIMIT " + limit))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "route");
            item.put("id", String.valueOf(r.getId()));
            item.put("name", r.getRouteName());
            item.put("status", r.getStatus());
            item.put("config_version", r.getConfigVersion() != null
                    ? String.valueOf(r.getConfigVersion()) : "0");
            item.put("updated_at", r.getUpdatedAt() != null
                    ? r.getUpdatedAt().toInstant().toEpochMilli() : 0L);
            merged.add(item);
        }
        for (Plugin p : pluginService.list(new LambdaQueryWrapper<Plugin>()
                .orderByDesc(Plugin::getUpdatedAt)
                .last("LIMIT " + limit))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "plugin");
            item.put("id", String.valueOf(p.getId()));
            item.put("name", p.getPluginName());
            item.put("status", p.getStatus());
            item.put("config_version", p.getConfigVersion() != null
                    ? String.valueOf(p.getConfigVersion()) : "0");
            item.put("updated_at", p.getUpdatedAt() != null
                    ? p.getUpdatedAt().toInstant().toEpochMilli() : 0L);
            merged.add(item);
        }

        merged.sort(Comparator.comparingLong(m -> (Long) m.get("updated_at")));
        java.util.Collections.reverse(merged);
        return merged.size() > limit ? new ArrayList<>(merged.subList(0, limit)) : merged;
    }
}
