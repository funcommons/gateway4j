package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.admin.mapper.ConfigPushLogMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 发布生效确认（P1-3 admin 侧）：读数据面 reload 后写的同步水位，比对 DB 全局版本。
 *
 * <p>跨 agent 契约：engine（H1）每次 reload 成功后 SET
 * {@code gateway4j:config:sync} = JSON
 * {@code {"version":N,"fingerprint":"...","updated_at":<epoch ms>,"instance":"..."}}，
 * TTL 120s（120s 内无 reload 视为水位过期）。</p>
 *
 * <p>DB 侧版本取 {@link ConfigPushLogMapper#selectMaxGlobalConfigVersion()}
 * （GREATEST(max gw_route.config_version, max gw_plugin.config_version)）。
 * {@code in_sync = (gateway.version == db_version)}：网关已加载版本追平 DB 即认为发布已生效。</p>
 *
 * <p>Redis key 不存在 / 拒连 / 坏 JSON → {@code available=false} + gateway=null，
 * 绝不抛异常（风格对齐 PluginRuntimeStatusService：管理面静默降级，前端显示
 * 「网关水位未知」而不是报错）。db_version 查询失败同样降级为 0，不 500。</p>
 */
@Service
public class ConfigSyncStatusService {

    private static final Logger log = LoggerFactory.getLogger(ConfigSyncStatusService.class);

    /** engine reload 后写的同步水位 key（与 gateway4j-engine 写入侧约定，勿单方面修改）。 */
    public static final String CONFIG_SYNC_KEY = "gateway4j:config:sync";

    private final MultiRedisManager multiRedisManager;
    private final ConfigPushLogMapper pushLogMapper;
    private final ObjectMapper objectMapper;

    public ConfigSyncStatusService(MultiRedisManager multiRedisManager,
                                   ConfigPushLogMapper pushLogMapper,
                                   ObjectMapper objectMapper) {
        this.multiRedisManager = multiRedisManager;
        this.pushLogMapper = pushLogMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 发布生效状态。
     *
     * @return {@code {"available":boolean,
     *         "gateway":{"version":N,"fingerprint":"...","updated_at":ms,"instance":"..."}|null,
     *         "db_version":N, "in_sync":boolean}}
     *         available=false 表示网关水位未知（key 缺失/TTL 过期/Redis 失败/坏 JSON）
     */
    public Map<String, Object> readSyncStatus() {
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> gateway = readGatewayWatermark();
        long dbVersion = resolveDbVersion();

        result.put("available", gateway != null);
        result.put("gateway", gateway);
        result.put("db_version", dbVersion);
        // 网关水位未知（available=false）时 in_sync 恒为 false：宁报未同步，不误报已生效
        result.put("in_sync", gateway != null
                && longValue(gateway.get("version"), Long.MIN_VALUE) == dbVersion);
        return result;
    }

    private static long longValue(Object raw, long fallback) {
        if (raw instanceof Number n) {
            return n.longValue();
        }
        try {
            return raw != null ? Long.parseLong(String.valueOf(raw)) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** 读 engine 写入的水位并归一为契约 Map；任何失败返回 null（available=false 路径），绝不抛出。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> readGatewayWatermark() {
        try {
            StringRedisTemplate template = multiRedisManager.getStringRedisTemplate("default");
            String raw = template.opsForValue().get(CONFIG_SYNC_KEY);
            if (raw == null || raw.isBlank()) {
                // TTL 过期 / engine 尚未写入 / H1 未上线 → 水位未知，静默降级
                return null;
            }
            JsonNode node = objectMapper.readTree(raw);
            if (node == null || !node.isObject()) {
                log.warn("[配置同步水位] key={} 内容非 JSON 对象，按水位未知处理", CONFIG_SYNC_KEY);
                return null;
            }
            return objectMapper.convertValue(node, Map.class);
        } catch (Exception e) {
            // Redis 连接失败 / 数据源缺失等一律降级为水位未知，绝不 500
            log.warn("[配置同步水位] 读取失败，按水位未知处理: {}", e.getMessage());
            return null;
        }
    }

    /** DB 全局最大 config_version；查询失败按 0 记并 warn（与通知器口径一致）。 */
    private long resolveDbVersion() {
        try {
            Long max = pushLogMapper.selectMaxGlobalConfigVersion();
            return max != null ? max : 0L;
        } catch (Exception e) {
            log.warn("[配置同步水位] 查询 DB 全局 config_version 失败，按 0 记: {}", e.getMessage());
            return 0L;
        }
    }
}
