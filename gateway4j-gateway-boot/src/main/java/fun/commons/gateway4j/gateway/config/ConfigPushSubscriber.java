package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.engine.config.sync.ConfigPushHandler;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import java.nio.charset.StandardCharsets;

/**
 * Subscribes the gateway data plane to the config-change push channel
 * {@code gateway4j:config:changed} (contract with the admin side, verbatim:
 * payload {@code {"version":N,"operator":"...","changedType":"route|plugin|global-plugin","at":epoch_ms}}).
 *
 * <p>Deliberately NOT a {@code RedisMessageListenerContainer} @Bean: bean
 * creation must never fail (nor the gateway refuse to boot) because Redis is
 * absent/down. The container is built and started inside
 * {@link SmartInitializingSingleton} with a hard try/catch — any failure
 * degrades to the periodic DB poll (60s), which stays active unconditionally
 * as the correctness fallback. Connection drops are logged via the container
 * error handler; the Lettuce-backed container re-subscribes automatically once
 * Redis is reachable again.</p>
 */
public class ConfigPushSubscriber implements SmartInitializingSingleton, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ConfigPushSubscriber.class);

    /** Contract with the admin publisher side — do not rename unilaterally. */
    public static final String CONFIG_CHANGED_CHANNEL = "gateway4j:config:changed";

    private final MultiRedisManager redisManager;
    private final ConfigPushHandler pushHandler;

    private volatile RedisMessageListenerContainer container;
    private volatile boolean subscribed;

    public ConfigPushSubscriber(MultiRedisManager redisManager, ConfigPushHandler pushHandler) {
        this.redisManager = redisManager;
        this.pushHandler = pushHandler;
    }

    @Override
    public void afterSingletonsInstantiated() {
        try {
            RedisConnectionFactory connectionFactory =
                    redisManager.getStringRedisTemplate().getRequiredConnectionFactory();
            RedisMessageListenerContainer c = new RedisMessageListenerContainer();
            c.setConnectionFactory(connectionFactory);
            c.setErrorHandler(t -> log.error(
                    "Config push subscription error (channel={}) - degraded to poll-only until reconnect",
                    CONFIG_CHANGED_CHANNEL, t));
            c.afterPropertiesSet();
            c.addMessageListener(new org.springframework.data.redis.connection.MessageListener() {
                @Override
                public void onMessage(org.springframework.data.redis.connection.Message message, byte[] pattern) {
                    String payload = message.getBody() == null
                            ? ""
                            : new String(message.getBody(), StandardCharsets.UTF_8);
                    pushHandler.onMessage(CONFIG_CHANGED_CHANNEL, payload);
                }
            }, new ChannelTopic(CONFIG_CHANGED_CHANNEL));
            c.start();
            this.container = c;
            this.subscribed = true;
            log.info("Subscribed to Redis config push channel '{}' - config changes now apply within seconds; "
                            + "the DB fingerprint poll stays active as fallback", CONFIG_CHANGED_CHANNEL);
        } catch (Exception e) {
            this.subscribed = false;
            log.error("Config push subscribe FAILED (channel={}) - running in poll-only mode "
                    + "(config changes apply within one poll interval): {}", CONFIG_CHANGED_CHANNEL, e.getMessage(), e);
        }
    }

    /** Subscription health for diagnostics/monitoring: true once the container started successfully. */
    public boolean isSubscribed() {
        return subscribed;
    }

    @Override
    public void destroy() {
        RedisMessageListenerContainer c = this.container;
        if (c != null) {
            try {
                c.destroy();
            } catch (Exception e) {
                log.warn("Error destroying config push subscriber: {}", e.getMessage());
            }
        }
    }
}
