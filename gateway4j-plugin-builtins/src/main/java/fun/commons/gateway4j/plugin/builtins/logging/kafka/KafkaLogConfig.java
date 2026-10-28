package fun.commons.gateway4j.plugin.builtins.logging.kafka;

import fun.commons.gateway4j.plugin.builtins.logging.ExternalLogConfig;

public class KafkaLogConfig extends ExternalLogConfig {

    private String bootstrapServer;
    private String topic;
    private String producerGroup;
    private String compressAlg;

    public String getBootstrapServer() {
        return bootstrapServer;
    }

    public void setBootstrapServer(String bootstrapServer) {
        this.bootstrapServer = bootstrapServer;
    }

    public String getTopic() {
        return topic;
    }

    public void setTopic(String topic) {
        this.topic = topic;
    }

    public String getProducerGroup() {
        return producerGroup;
    }

    public void setProducerGroup(String producerGroup) {
        this.producerGroup = producerGroup;
    }

    public String getCompressAlg() {
        return compressAlg;
    }

    public void setCompressAlg(String compressAlg) {
        this.compressAlg = compressAlg;
    }
}
