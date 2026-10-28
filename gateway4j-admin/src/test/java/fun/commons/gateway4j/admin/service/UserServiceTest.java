package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.UserMapper;
import fun.commons.gateway4j.admin.mapper.UserRoleRelMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.User;
import fun.commons.gateway4j.common.model.UserRoleRel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserServiceTest {

    @Mock private UserMapper userMapper;
    @Mock private UserRoleRelMapper userRoleRelMapper;

    private UserService userService;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        userService = new UserService(userRoleRelMapper);
        setBaseMapper(userService, userMapper);
    }

    private void setBaseMapper(Object service, Object mapper) throws Exception {
        Field field = findField(service.getClass(), "baseMapper");
        field.setAccessible(true);
        field.set(service, mapper);
    }

    private Field findField(Class<?> clazz, String name) {
        for (Class<?> c = clazz; c != null; c = c.getSuperclass()) {
            try { return c.getDeclaredField(name); } catch (NoSuchFieldException e) { /* continue */ }
        }
        throw new RuntimeException("Field not found: " + name);
    }

    @Test
    void createUserSuccess() {
        when(userMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(userMapper.insert(any(User.class))).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(1L);
            return 1;
        });
        when(userRoleRelMapper.insert(any(UserRoleRel.class))).thenReturn(1);

        User user = User.builder().username("testuser").password("pass123").build();
        User result = userService.createUser(user, List.of("ADMIN"));
        assertNotNull(result);
        verify(userRoleRelMapper).insert(any(UserRoleRel.class));
    }

    @Test
    void createUserDuplicateUsernameThrows() {
        when(userMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        User user = User.builder().username("duplicate").password("pass").build();
        assertThrows(BusinessException.class, () -> userService.createUser(user, null));
    }

    @Test
    void updateUserSuccess() {
        User existing = User.builder().id(1L).username("old").password("encoded").build();
        when(userMapper.selectById(1L)).thenReturn(existing);
        when(userMapper.updateById(any(User.class))).thenReturn(1);

        User update = new User();
        update.setUsername("new");
        update.setPassword(null);
        userService.updateUser(1L, update, null);
        verify(userMapper).updateById(any(User.class));
    }

    @Test
    void updateUserNotFound() {
        when(userMapper.selectById(999L)).thenReturn(null);
        User update = new User();
        assertThrows(BusinessException.class, () -> userService.updateUser(999L, update, null));
    }

    @Test
    void deleteUserSuccess() {
        User existing = User.builder().id(1L).username("test").build();
        when(userMapper.selectById(1L)).thenReturn(existing);
        when(userMapper.deleteById(1L)).thenReturn(1);

        userService.deleteUser(1L);
        verify(userMapper).deleteById(1L);
        verify(userRoleRelMapper).delete(any(LambdaQueryWrapper.class));
    }

    @Test
    void resetPasswordSuccess() {
        User user = User.builder().id(1L).username("test").password("old").build();
        when(userMapper.selectById(1L)).thenReturn(user);
        when(userMapper.updateById(any(User.class))).thenReturn(1);

        userService.resetPassword(1L, "newpass");
        verify(userMapper).updateById(any(User.class));
    }
}
