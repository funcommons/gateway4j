package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 内置插件数据面运行时状态读取（管理面只读）。
 *
 * <p>跨 agent 契约：engine 每次 reload 后写 Redis，key = {@link #RUNTIME_KEY}，
 * value = JSON 数组字符串
 * [{"plugin_id":"security","phase":"PRE","registered":true,"updated_at":1719512345678}, ...]，
 * TTL 10 分钟。</p>
 *
 * <p>key 不存在 / Redis 失败 / 内容解析失败 = 状态未知 → 返回 {@code available=false} + 空列表，
 * 绝不抛出（管理面静默降级，前端不显示接线徽标）。</p>
 */
@Service
public class PluginRuntimeStatusService {

    private static final Logger log = LoggerFactory.getLogger(PluginRuntimeStatusService.class);

    /** engine 写入的插件运行时状态 key（与 gateway4j-engine 写入侧约定，勿单方面修改）。 */
    public static final String RUNTIME_KEY = "gateway4j:plugin:runtime";

    private final MultiRedisManager multiRedisManager;
    private final ObjectMapper objectMapper;

    public PluginRuntimeStatusService(MultiRedisManager multiRedisManager, ObjectMapper objectMapper) {
        this.multiRedisManager = multiRedisManager;
        this.objectMapper = objectMapper;
    }

    /**
     * 读取数据面插件接线状态。
     *
     * @return {@code {"available": boolean, "items": [{plugin_id, phase, registered, updated_at}]}}
     *         available=false 表示状态未知（key 不存在 / Redis 失败 / 解析失败）
     */
    public Map<String, Object> readRuntimeStatus() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", false);
        result.put("items", new ArrayList<Map<String, Object>>());
        try {
            StringRedisTemplate template = multiRedisManager.getStringRedisTemplate("default");
            String raw = template.opsForValue().get(RUNTIME_KEY);
            if (raw == null || raw.isBlank()) {
                // TTL 过期 / engine 尚未写入 → 状态未知，静默降级
                return result;
            }
            JsonNode arr = objectMapper.readTree(raw);
            if (!arr.isArray()) {
                log.warn("[插件运行时状态] key={} 内容非 JSON 数组，按状态未知处理", RUNTIME_KEY);
                return result;
            }
            List<Map<String, Object>> items = new ArrayList<>();
            for (JsonNode node : arr) {
                Map<String, Object> item = toItem(node);
                if (item != null) {
                    items.add(item);
                }
            }
            result.put("available", true);
            result.put("items", items);
        } catch (Exception e) {
            // Redis 连接失败 / 数据源缺失等一律降级为状态未知，绝不 500
            log.warn("[插件运行时状态] 读取失败，按状态未知处理: {}", e.getMessage());
        }
        return result;
    }

    /** 单条记录解析；缺 plugin_id 或非对象的条目跳过，不影响整体 available。 */
    private Map<String, Object> toItem(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        String pluginId = node.path("plugin_id").asText("");
        if (pluginId.isBlank()) {
            return null;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("plugin_id", pluginId);
        item.put("phase", node.path("phase").asText(""));
        item.put("registered", node.path("registered").asBoolean(false));
        item.put("updated_at", node.path("updated_at").asLong(0L));
        return item;
    }
}
