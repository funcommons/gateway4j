package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RoleTest {

    @Test
    void builderWithAllFields() {
        Role role = Role.builder()
                .roleCode("ROLE_ADMIN")
                .roleName("超级管理员")
                .remark("系统管理员")
                .build();

        assertEquals("ROLE_ADMIN", role.getRoleCode());
        assertEquals("超级管理员", role.getRoleName());
    }
}
