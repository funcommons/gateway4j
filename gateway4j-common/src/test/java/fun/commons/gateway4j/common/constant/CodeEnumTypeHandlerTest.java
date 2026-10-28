package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CodeEnumTypeHandlerTest {

    private final CodeEnumTypeHandler<RouteType> handler = new CodeEnumTypeHandler<>(RouteType.class);

    @Test
    void roundTripDispatch() {
        assertEquals(RouteType.DISPATCH, handler.fromCodeString("DISPATCH"));
    }

    @Test
    void roundTripBackend() {
        assertEquals(RouteType.BACKEND, handler.fromCodeString("BACKEND"));
    }

    @Test
    void fromCodeStringNull() {
        assertNull(handler.fromCodeString(null));
    }

    @Test
    void fromCodeStringUnknown() {
        assertThrows(IllegalArgumentException.class, () -> handler.fromCodeString("UNKNOWN"));
    }

    @Test
    void worksWithAllCodeEnums() {
        CodeEnumTypeHandler<PluginPhase> phaseHandler = new CodeEnumTypeHandler<>(PluginPhase.class);
        assertEquals(PluginPhase.PRE, phaseHandler.fromCodeString("PRE"));
        assertEquals(PluginPhase.POST, phaseHandler.fromCodeString("POST"));

        CodeEnumTypeHandler<ConditionOperator> opHandler = new CodeEnumTypeHandler<>(ConditionOperator.class);
        assertEquals(ConditionOperator.EQ, opHandler.fromCodeString("EQ"));
        assertEquals(ConditionOperator.REGEX, opHandler.fromCodeString("REGEX"));
    }
}
