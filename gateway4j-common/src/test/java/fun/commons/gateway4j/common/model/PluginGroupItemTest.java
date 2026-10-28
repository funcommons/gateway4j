package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginGroupItemTest {

    @Test
    void defaultSortOrder() {
        PluginGroupItem item = PluginGroupItem.builder().build();
        assertEquals(0, item.getSortOrder());
    }

    @Test
    void builderWithAllFields() {
        PluginGroupItem item = PluginGroupItem.builder()
                .groupPluginId(10L)
                .memberPluginId(20L)
                .sortOrder(3)
                .build();

        assertEquals(10L, item.getGroupPluginId());
        assertEquals(20L, item.getMemberPluginId());
        assertEquals(3, item.getSortOrder());
    }
}
