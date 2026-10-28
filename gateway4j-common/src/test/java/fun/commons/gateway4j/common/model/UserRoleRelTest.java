package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class UserRoleRelTest {

    @Test
    void builderWithAllFields() {
        UserRoleRel rel = UserRoleRel.builder()
                .userId(1L)
                .roleCode("ROLE_ADMIN")
                .build();

        assertEquals(1L, rel.getUserId());
        assertEquals("ROLE_ADMIN", rel.getRoleCode());
    }
}
