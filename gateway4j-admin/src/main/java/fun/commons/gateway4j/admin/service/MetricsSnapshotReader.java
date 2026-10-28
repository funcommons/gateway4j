package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 路由指标跨 JVM 快照读取（管理面只读）。
 *
 * <p>跨 agent 契约：gateway 数据面（gateway4j-gateway-boot）的
 * MetricsSnapshotPublisher 每 5s 把本 JVM MeterRegistry 按 {@code path} tag
 * 聚合后的指标写入 Redis HASH，key = {@link #METRICS_SNAPSHOT_KEY}，
 * field = meter 的 path tag 原文，value = JSON
 * {"total":N,"errors":N,"latency_ms_sum":F,"latency_count":N,"updated_at":epoch_ms}，
 * 每轮写完 EXPIRE 60。</p>
 *
 * <p>本类只补本地注册表的空缺：管理台 JVM 没有流量经过，本地 MeterRegistry
 * 恒为空，真实指标都在数据面 JVM。key 不存在 / field 不存在 / Redis 拒连 /
 * 坏 JSON 一律返回 {@link #ZERO}，绝不抛异常（监控接口静默降级为 0）。</p>
 */
@Service
public class MetricsSnapshotReader {

    private static final Logger log = LoggerFactory.getLogger(MetricsSnapshotReader.class);

    /** gateway 数据面写入的指标快照 key（与 MetricsSnapshotPublisher 约定，勿单方面修改）。 */
    public static final String METRICS_SNAPSHOT_KEY = "gateway4j:metrics:routes";

    /** 全 0 快照（快照不可用时的降级值）。 */
    public static final MetricsSnapshot ZERO = new MetricsSnapshot(0L, 0L, 0d, 0L);

    private final MultiRedisManager multiRedisManager;
    private final ObjectMapper objectMapper;

    public MetricsSnapshotReader(MultiRedisManager multiRedisManager, ObjectMapper objectMapper) {
        this.multiRedisManager = multiRedisManager;
        this.objectMapper = objectMapper;
    }

    /**
     * 读取指定 path 的指标快照分量；任何失败（key/field 不存在、Redis 拒连、坏 JSON）
     * 都返回 {@link #ZERO}，绝不抛出。
     */
    public MetricsSnapshot readByPath(String path) {
        if (path == null || path.isBlank()) {
            return ZERO;
        }
        try {
            StringRedisTemplate template = multiRedisManager.getStringRedisTemplate("default");
            Object raw = template.opsForHash().get(METRICS_SNAPSHOT_KEY, path);
            if (!(raw instanceof String json) || json.isBlank()) {
                // TTL 过期 / 数据面尚未写入 / field 不存在 → 无快照，按 0 处理
                return ZERO;
            }
            JsonNode node = objectMapper.readTree(json);
            if (node == null || !node.isObject()) {
                log.warn("[指标快照] key={} field={} 内容非 JSON 对象，按 0 处理", METRICS_SNAPSHOT_KEY, path);
                return ZERO;
            }
            return new MetricsSnapshot(
                    node.path("total").asLong(0L),
                    node.path("errors").asLong(0L),
                    node.path("latency_ms_sum").asDouble(0d),
                    node.path("latency_count").asLong(0L));
        } catch (Exception e) {
            // Redis 连接失败 / 数据源缺失等一律按 0 处理，绝不 500
            log.warn("[指标快照] 读取失败（key={} field={}），按 0 处理: {}",
                    METRICS_SNAPSHOT_KEY, path, e.getMessage());
            return ZERO;
        }
    }

    /**
     * 快照分量（只读值对象）。total/errors/latency_count 为整数，latency_ms_sum
     * 为毫秒（可带小数）。
     */
    public record MetricsSnapshot(long total, long errors, double latencyMsSum, long latencyCount) {
    }
}
