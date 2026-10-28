package fun.commons.gateway4j.plugin.builtins.logging.elasticsearch;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.plugin.builtins.logging.AbstractExternalLoggingPlugin;
import fun.commons.gateway4j.plugin.builtins.logging.ExternalLogConfig;
import fun.commons.gateway4j.plugin.builtins.logging.LogDesensitizer;
import fun.commons.gateway4j.plugin.builtins.logging.LoggingPluginConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class LoggingElasticsearchPlugin extends AbstractExternalLoggingPlugin {

    private static final Logger log = LoggerFactory.getLogger(LoggingElasticsearchPlugin.class);
    private static final int BATCH_SIZE = 100;
    private static final long FLUSH_INTERVAL_MS = 100;
    private static final int DEFAULT_BUFFER_SIZE = 50000;

    private volatile ElasticsearchLogConfig config;
    private final BlockingQueue<Map<String, Object>> buffer = new LinkedBlockingQueue<>(DEFAULT_BUFFER_SIZE);
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile ScheduledExecutorService scheduler;
    private volatile WebClient webClient;
    private volatile LogDesensitizer desensitizer;

    public LoggingElasticsearchPlugin() {
        this(false);
    }

    public LoggingElasticsearchPlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.LOGGING_ES_POST : BuiltinPluginConstants.LOGGING_ES,
                isPostPhase ? "Elasticsearch日志插件（后置）" : "Elasticsearch日志插件",
                isPostPhase ? "POST" : "PRE",
                7, isPostPhase);
    }

    @Override
    protected ExternalLogConfig getLogConfig() {
        return config;
    }

    @Override
    protected void collectLog(Map<String, Object> logData) {
        if (desensitizer != null) {
            for (Map.Entry<String, Object> entry : logData.entrySet()) {
                if (entry.getValue() instanceof String strVal) {
                    entry.setValue(desensitizer.desensitize(strVal));
                }
            }
        }
        if (!buffer.offer(logData)) {
            log.warn("ES log buffer full, dropping log entry");
        }
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        ElasticsearchLogConfig newConfig = JsonUtils.parseObject(pluginConfig.config(), ElasticsearchLogConfig.class);
        this.config = newConfig;

        if (newConfig != null) {
            if (newConfig.getDesensitizeRules() != null) {
                this.desensitizer = new LogDesensitizer(newConfig.getDesensitizeRules());
            }

            if (newConfig.isEnabled() && newConfig.getHost() != null) {
                WebClient.Builder builder = WebClient.builder()
                        .baseUrl(newConfig.getHost() + ":" + (newConfig.getPort() != null ? newConfig.getPort() : 9200));
                if (newConfig.getUsername() != null && newConfig.getPassword() != null) {
                    builder.defaultHeaders(headers -> headers.setBasicAuth(newConfig.getUsername(), newConfig.getPassword()));
                }
                this.webClient = builder.build();
                startConsumer();
            } else {
                stopConsumer();
            }
        }
    }

    @Override
    public void onDestroy() {
        stopConsumer();
    }

    private void startConsumer() {
        if (running.compareAndSet(false, true)) {
            scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "es-log-consumer");
                t.setDaemon(true);
                return t;
            });
            scheduler.scheduleAtFixedRate(this::flushBuffer, FLUSH_INTERVAL_MS, FLUSH_INTERVAL_MS, TimeUnit.MILLISECONDS);
            log.info("ES log consumer started");
        }
    }

    private void stopConsumer() {
        if (running.compareAndSet(true, false)) {
            if (scheduler != null) {
                scheduler.shutdown();
                scheduler = null;
            }
            flushBuffer();
            buffer.clear();
            log.info("ES log consumer stopped");
        }
    }

    private void flushBuffer() {
        List<Map<String, Object>> batch = new ArrayList<>(BATCH_SIZE);
        buffer.drainTo(batch, BATCH_SIZE);
        if (batch.isEmpty()) return;

        try {
            sendToElasticsearch(batch);
        } catch (Exception e) {
            log.warn("Failed to send logs to Elasticsearch: {}", e.getMessage());
        }
    }

    private void sendToElasticsearch(List<Map<String, Object>> logs) {
        if (webClient == null) {
            log.debug("ES WebClient not initialized, skipping {} log entries", logs.size());
            return;
        }

        String indexName = config != null && config.getIndexName() != null
                ? config.getIndexName() : "gateway4j-access-logs";
        String indexWithDate = indexName + "-" + Instant.now().toString().substring(0, 10);

        StringBuilder bulkBody = new StringBuilder();
        for (Map<String, Object> logEntry : logs) {
            bulkBody.append("{\"index\":{\"_index\":\"").append(indexWithDate).append("\"}}\n");
            bulkBody.append(JsonUtils.toCompactJson(logEntry)).append("\n");
        }

        webClient.post()
                .uri("/_bulk")
                .header("Content-Type", "application/x-ndjson")
                .bodyValue(bulkBody.toString())
                .retrieve()
                .bodyToMono(String.class)
                .doOnNext(response -> log.debug("ES bulk indexed {} logs", logs.size()))
                .doOnError(e -> log.warn("ES bulk indexing failed: {}", e.getMessage()))
                .subscribe();
    }
}
