package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RouteConditionTest {

    @Test
    void defaultPriority() {
        RouteCondition rc = RouteCondition.builder().build();
        assertEquals(0, rc.getPriority());
    }

    @Test
    void builderWithAllFields() {
        RouteCondition rc = RouteCondition.builder()
                .routeId(1L)
                .targetRouteId(2L)
                .conditionType("HEADER")
                .operator("EQ")
                .conditionKey("X-Version")
                .conditionValue("v2")
                .priority(5)
                .build();

        assertEquals(1L, rc.getRouteId());
        assertEquals(2L, rc.getTargetRouteId());
        assertEquals("HEADER", rc.getConditionType());
        assertEquals("EQ", rc.getOperator());
        assertEquals("X-Version", rc.getConditionKey());
        assertEquals("v2", rc.getConditionValue());
        assertEquals(5, rc.getPriority());
    }
}
