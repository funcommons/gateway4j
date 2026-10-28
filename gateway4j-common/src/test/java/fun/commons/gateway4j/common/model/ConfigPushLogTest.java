package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConfigPushLogTest {

    @Test
    void defaultPushStatus() {
        ConfigPushLog log = ConfigPushLog.builder().build();
        assertEquals("PENDING", log.getPushStatus());
    }

    @Test
    void defaultRetryCount() {
        ConfigPushLog log = ConfigPushLog.builder().build();
        assertEquals(0, log.getRetryCount());
    }

    @Test
    void builderWithAllFields() {
        ConfigPushLog log = ConfigPushLog.builder()
                .configType("ROUTE")
                .configId(1L)
                .configVersion(5L)
                .changeType("UPDATE")
                .instanceId("gw-instance-01")
                .pushStatus("SUCCESS")
                .build();

        assertEquals("ROUTE", log.getConfigType());
        assertEquals("UPDATE", log.getChangeType());
        assertEquals("SUCCESS", log.getPushStatus());
    }
}
