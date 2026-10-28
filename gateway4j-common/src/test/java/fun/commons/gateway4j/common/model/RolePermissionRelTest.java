package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RolePermissionRelTest {

    @Test
    void builderWithAllFields() {
        RolePermissionRel rel = RolePermissionRel.builder()
                .roleCode("ROLE_ADMIN")
                .permissionCode("route:read")
                .build();

        assertEquals("ROLE_ADMIN", rel.getRoleCode());
        assertEquals("route:read", rel.getPermissionCode());
    }
}
