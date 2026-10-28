package fun.commons.gateway4j.engine.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EnginePropertiesTest {

    @Test
    void defaultMaxDepth() {
        EngineProperties props = new EngineProperties();
        assertEquals(5, props.getMaxDepth());
    }

    @Test
    void defaultTimeout() {
        EngineProperties props = new EngineProperties();
        assertEquals(30, props.getDefaultTimeout());
    }

    @Test
    void customValues() {
        EngineProperties props = new EngineProperties();
        props.setMaxDepth(10);
        props.setDefaultTimeout(60);
        assertEquals(10, props.getMaxDepth());
        assertEquals(60, props.getDefaultTimeout());
    }
}
