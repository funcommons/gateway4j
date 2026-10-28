package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RouteCanvasTest {

    @Test
    void defaultCanvasData() {
        RouteCanvas canvas = RouteCanvas.builder().build();
        assertEquals("{}", canvas.getCanvasData());
    }

    @Test
    void builderWithAllFields() {
        RouteCanvas canvas = RouteCanvas.builder()
                .routeId(1L)
                .canvasData("{\"nodes\":[],\"edges\":[]}")
                .build();

        assertEquals(1L, canvas.getRouteId());
        assertEquals("{\"nodes\":[],\"edges\":[]}", canvas.getCanvasData());
    }
}
