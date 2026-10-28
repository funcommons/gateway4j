package fun.commons.gateway4j.plugin.builtins.logging.kafka;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.plugin.builtins.logging.AbstractExternalLoggingPlugin;
import fun.commons.gateway4j.plugin.builtins.logging.ExternalLogConfig;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicReference;

public class LoggingKafkaPlugin extends AbstractExternalLoggingPlugin {

    private static final Logger log = LoggerFactory.getLogger(LoggingKafkaPlugin.class);

    private volatile KafkaLogConfig config;
    private final AtomicReference<KafkaProducer<String, String>> producerRef = new AtomicReference<>();

    public LoggingKafkaPlugin() {
        this(false);
    }

    public LoggingKafkaPlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.LOGGING_KAFKA_POST : BuiltinPluginConstants.LOGGING_KAFKA,
                isPostPhase ? "Kafka日志插件（后置）" : "Kafka日志插件",
                isPostPhase ? "POST" : "PRE",
                6, isPostPhase);
    }

    @Override
    protected ExternalLogConfig getLogConfig() {
        return config;
    }

    @Override
    protected void collectLog(Map<String, Object> logData) {
        KafkaProducer<String, String> producer = producerRef.get();
        if (producer == null) {
            return;
        }
        try {
            String json = JsonUtils.toCompactJson(logData);
            String topic = config.getTopic() != null ? config.getTopic() : "gateway4j-access-logs";
            producer.send(new ProducerRecord<>(topic, json));
        } catch (Exception e) {
            log.warn("Failed to send log to Kafka: {}", e.getMessage());
        }
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        KafkaLogConfig newConfig = JsonUtils.parseObject(pluginConfig.config(), KafkaLogConfig.class);
        this.config = newConfig;
        initProducer();
    }

    @Override
    public void onDestroy() {
        KafkaProducer<String, String> old = producerRef.getAndSet(null);
        if (old != null) {
            old.close();
        }
    }

    private void initProducer() {
        if (config == null || !config.isEnabled() || config.getBootstrapServer() == null) {
            closeProducer();
            return;
        }
        try {
            Properties props = new Properties();
            props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, config.getBootstrapServer());
            props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
            props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
            if (config.getCompressAlg() != null && !config.getCompressAlg().isEmpty()) {
                props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, config.getCompressAlg());
            }
            KafkaProducer<String, String> newProducer = new KafkaProducer<>(props);

            KafkaProducer<String, String> old = producerRef.getAndSet(newProducer);
            if (old != null) {
                old.close();
            }
            log.info("Kafka logging producer initialized: {}", config.getBootstrapServer());
        } catch (Exception e) {
            log.error("Failed to initialize Kafka producer: {}", e.getMessage());
        }
    }

    private void closeProducer() {
        KafkaProducer<String, String> old = producerRef.getAndSet(null);
        if (old != null) {
            old.close();
        }
    }
}
