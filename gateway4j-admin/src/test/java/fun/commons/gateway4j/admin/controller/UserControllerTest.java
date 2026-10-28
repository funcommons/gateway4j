package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.gateway4j.admin.service.UserService;
import fun.commons.gateway4j.common.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock private UserService userService;
    @InjectMocks private UserController controller;

    @Test
    void listUsers() {
        Page<User> page = new Page<>(1, 20);
        when(userService.listUsers(1, 20, null, null)).thenReturn(page);
        var result = controller.listUsers(1, 20, null, null);
        assertNotNull(result);
        assertEquals(0, result.getCode());
        assertEquals(page, result.getData());
        verify(userService).listUsers(1, 20, null, null);
    }

    @Test
    void listUsersPageSizeCapped() {
        Page<User> page = new Page<>(1, 100);
        when(userService.listUsers(1, 100, null, null)).thenReturn(page);
        controller.listUsers(1, 500, null, null);
        verify(userService).listUsers(1, 100, null, null);
    }

    @Test
    void createUser() {
        User user = User.builder().id(1L).username("u1").build();
        when(userService.createUser(any(User.class), any())).thenReturn(user);
        User result = controller.createUser(new UserController.UserCreateRequest(
                "u1", "pass123", "Name", "138", List.of("ROLE_ADMIN")));
        assertEquals(1L, result.getId());
        verify(userService).createUser(any(User.class), eq(List.of("ROLE_ADMIN")));
    }

    @Test
    void updateUser() {
        User existing = User.builder().id(1L).username("old").build();
        when(userService.getById(1L)).thenReturn(existing);
        User result = controller.updateUser(1L, new UserController.UserUpdateRequest(
                "new", null, null, null, null, null));
        verify(userService).updateUser(eq(1L), any(User.class), isNull());
    }

    @Test
    void deleteUser() {
        controller.deleteUser(1L);
        verify(userService).deleteUser(1L);
    }

    @Test
    void resetPassword() {
        controller.resetPassword(1L, new UserController.ResetPasswordRequest("newpass123"));
        verify(userService).resetPassword(1L, "newpass123");
    }
}
