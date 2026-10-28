package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RoutePluginBindingTest {

    @Test
    void defaultBindingConfig() {
        RoutePluginBinding binding = RoutePluginBinding.builder().build();
        assertEquals("{}", binding.getBindingConfig());
    }

    @Test
    void defaultSortOrder() {
        RoutePluginBinding binding = RoutePluginBinding.builder().build();
        assertEquals(0, binding.getSortOrder());
    }

    @Test
    void builderWithAllFields() {
        RoutePluginBinding binding = RoutePluginBinding.builder()
                .routeId(1L)
                .pluginId(2L)
                .sortOrder(5)
                .bindingConfig("{\"ttl\":300}")
                .build();

        assertEquals(1L, binding.getRouteId());
        assertEquals(2L, binding.getPluginId());
        assertEquals(5, binding.getSortOrder());
        assertEquals("{\"ttl\":300}", binding.getBindingConfig());
    }
}
