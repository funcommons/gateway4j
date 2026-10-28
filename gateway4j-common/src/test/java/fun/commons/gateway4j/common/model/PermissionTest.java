package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PermissionTest {

    @Test
    void defaultSortOrder() {
        Permission perm = Permission.builder().build();
        assertEquals(0, perm.getSortOrder());
    }

    @Test
    void builderWithAllFields() {
        Permission perm = Permission.builder()
                .permissionCode("route:read")
                .permissionName("查看路由")
                .resourceType("MENU")
                .parentId(null)
                .sortOrder(1)
                .build();

        assertEquals("route:read", perm.getPermissionCode());
        assertEquals("MENU", perm.getResourceType());
    }
}
