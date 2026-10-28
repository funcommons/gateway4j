package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class UserTest {

    @Test
    void defaultStatus() {
        User user = User.builder().build();
        assertEquals("ENABLED", user.getStatus());
    }

    @Test
    void builderWithAllFields() {
        User user = User.builder()
                .id(1L)
                .username("admin")
                .password("hashed")
                .realName("管理员")
                .phone("18600001234")
                .status("ENABLED")
                .build();

        assertEquals("admin", user.getUsername());
        assertEquals("hashed", user.getPassword());
        assertEquals("管理员", user.getRealName());
    }
}
