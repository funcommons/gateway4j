package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.admin.mapper.ConfigPushLogMapper;
import fun.commons.gateway4j.common.model.ConfigPushLog;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 配置变更通知器：把管理面的路由/插件写操作广播到 Redis，驱动网关实例即时重载配置。
 * <p>
 * 监听 {@link ConfigChangeEvent}（RouteService/PluginService 写操作成功后已统一发布），
 * 在事务提交后 {@code PUBLISH gateway4j:config:changed}，payload 契约（与 engine 侧订阅方逐字对齐）：
 * <pre>{@code
 * {"version":<全局max config_version>, "operator":"<用户名或anonymous>",
 *  "changedType":"route|plugin|global-plugin", "at":<epoch ms>}
 * }</pre>
 * <p>
 * 同时落一条 gw_config_push_log 推送审计。通知与审计均不回抛异常——
 * Redis 不可用或审计写入失败只记日志，绝不影响已提交的主流程。
 */
@Slf4j
@Component
public class ConfigChangeNotifier {

    /** 配置变更广播频道（engine 侧按同名频道订阅，契约固定不得修改）。 */
    public static final String CONFIG_CHANGED_CHANNEL = "gateway4j:config:changed";

    /** 推送审计的实例标识：Redis 广播无单一目标实例，以管理面广播者身份落库。 */
    private static final String BROADCAST_INSTANCE_ID = "admin-broadcast";

    private final MultiRedisManager redisManager;
    private final ConfigPushLogMapper pushLogMapper;

    public ConfigChangeNotifier(@Autowired(required = false) MultiRedisManager redisManager,
                                ConfigPushLogMapper pushLogMapper) {
        this.redisManager = redisManager;
        this.pushLogMapper = pushLogMapper;
    }

    /**
     * 事务提交后广播配置变更（无事务时立即执行）。任何异常吞掉并记日志。
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onConfigChange(ConfigChangeEvent event) {
        String changedType = toChangedType(event.getConfigType());
        long at = System.currentTimeMillis();
        long version = resolveGlobalVersion();
        String operator = resolveOperator();
        String payload = buildPayload(version, operator, changedType, at);

        boolean published = publish(payload);
        writePushLog(event, version, published);
    }

    /** ROUTE→route，PLUGIN→plugin，GLOBAL_PLUGIN→global-plugin（未知类型同规则兜底）。 */
    private String toChangedType(String configType) {
        return configType == null ? "route" : configType.toLowerCase().replace('_', '-');
    }

    private long resolveGlobalVersion() {
        try {
            Long max = pushLogMapper.selectMaxGlobalConfigVersion();
            return max != null ? max : 0L;
        } catch (Exception e) {
            log.warn("[配置通知] 查询全局 config_version 失败，version 按 0 通知: {}", e.getMessage());
            return 0L;
        }
    }

    /** 从 TokenContext 取当前登录名；开放 API/系统内部调用等无登录态时归为 anonymous。 */
    private String resolveOperator() {
        try {
            Object username = TokenContext.getClaim("username");
            return username != null && !String.valueOf(username).isBlank()
                    ? String.valueOf(username) : "anonymous";
        } catch (Exception e) {
            return "anonymous";
        }
    }

    private String buildPayload(long version, String operator, String changedType, long at) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", version);
        payload.put("operator", operator);
        payload.put("changedType", changedType);
        payload.put("at", at);
        return JsonUtils.toCompactJson(payload);
    }

    private boolean publish(String payload) {
        if (redisManager == null) {
            log.warn("[配置通知] MultiRedisManager 未装配，跳过 Redis 广播");
            return false;
        }
        try {
            redisManager.getStringRedisTemplate("default")
                    .convertAndSend(CONFIG_CHANGED_CHANNEL, payload);
            log.info("[配置通知] 已广播 channel={}, payload={}", CONFIG_CHANGED_CHANNEL, payload);
            return true;
        } catch (Exception e) {
            log.warn("[配置通知] Redis 广播失败（不影响主流程）: {}", e.getMessage());
            return false;
        }
    }

    /** 推送审计落 gw_config_push_log，失败仅记日志。 */
    private void writePushLog(ConfigChangeEvent event, long version, boolean published) {
        try {
            pushLogMapper.insert(ConfigPushLog.builder()
                    .configType(event.getConfigType())
                    .configId(event.getConfigId() != null ? event.getConfigId() : 0L)
                    .configVersion(version)
                    .changeType(event.getChangeType())
                    .instanceId(BROADCAST_INSTANCE_ID)
                    .pushStatus(published ? "SUCCESS" : "FAILED")
                    .createdAt(java.time.OffsetDateTime.now())
                    .updatedAt(java.time.OffsetDateTime.now())
                    .build());
        } catch (Exception e) {
            log.warn("[配置通知] 推送审计写入失败（不影响主流程）: {}", e.getMessage());
        }
    }
}
