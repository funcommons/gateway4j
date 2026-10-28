package fun.commons.gateway4j.engine.route.validator;

import fun.commons.gateway4j.common.exception.CyclicReferenceException;
import fun.commons.gateway4j.common.exception.DepthExceededException;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RouteValidatorTest {

    private RouteValidator validator;

    @BeforeEach
    void setUp() {
        validator = new RouteValidator();
    }

    @Test
    void validDagPasses() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 2L), cond(1L, 3L)),
                2L, List.of(cond(2L, 4L))
        );
        assertDoesNotThrow(() -> validator.validateCyclicReference(1L, conditions));
    }

    @Test
    void simpleCycleDetected() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 2L)),
                2L, List.of(cond(2L, 1L))
        );
        assertThrows(CyclicReferenceException.class,
                () -> validator.validateCyclicReference(1L, conditions));
    }

    @Test
    void indirectCycleDetected() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 2L)),
                2L, List.of(cond(2L, 3L)),
                3L, List.of(cond(3L, 1L))
        );
        assertThrows(CyclicReferenceException.class,
                () -> validator.validateCyclicReference(1L, conditions));
    }

    @Test
    void selfCycleDetected() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 1L))
        );
        assertThrows(CyclicReferenceException.class,
                () -> validator.validateCyclicReference(1L, conditions));
    }

    @Test
    void depthExceeded() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 2L)),
                2L, List.of(cond(2L, 3L)),
                3L, List.of(cond(3L, 4L)),
                4L, List.of(cond(4L, 5L)),
                5L, List.of(cond(5L, 6L))
        );
        assertThrows(DepthExceededException.class,
                () -> validator.validateDepth(1L, conditions));
    }

    @Test
    void validDepthPasses() {
        Map<Long, List<RouteCondition>> conditions = Map.of(
                1L, List.of(cond(1L, 2L)),
                2L, List.of(cond(2L, 3L))
        );
        assertDoesNotThrow(() -> validator.validateDepth(1L, conditions));
    }

    private RouteCondition cond(Long routeId, Long targetId) {
        return RouteCondition.builder()
                .routeId(routeId).targetRouteId(targetId)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Test").conditionValue("1").build();
    }
}
