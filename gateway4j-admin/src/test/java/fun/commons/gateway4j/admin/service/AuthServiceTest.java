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

class AuthServiceTest {

    @Mock private UserMapper userMapper;
    @Mock private UserRoleRelMapper userRoleRelMapper;

    private AuthService authService;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        authService = new AuthService(userRoleRelMapper);
        setBaseMapper(authService, userMapper);
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
    void authenticateSuccess() {
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        String encodedPassword = encoder.encode("password123");
        User user = User.builder().id(1L).username("admin")
                .password(encodedPassword)
                .status("ENABLED").build();
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

        User result = authService.authenticate("admin", "password123");
        assertNotNull(result);
        assertEquals("admin", result.getUsername());
    }

    @Test
    void authenticateWrongPasswordThrows() {
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        String encodedPassword = encoder.encode("correct");
        User user = User.builder().id(1L).username("admin")
                .password(encodedPassword)
                .status("ENABLED").build();
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

        assertThrows(BusinessException.class, () -> authService.authenticate("admin", "wrong"));
    }

    @Test
    void authenticateUserNotFoundThrows() {
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        assertThrows(BusinessException.class, () -> authService.authenticate("nobody", "pass"));
    }

    @Test
    void getUserRoleCodes() {
        UserRoleRel rel1 = UserRoleRel.builder().userId(1L).roleCode("ADMIN").build();
        UserRoleRel rel2 = UserRoleRel.builder().userId(1L).roleCode("OPERATOR").build();
        when(userRoleRelMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rel1, rel2));

        List<String> roles = authService.getUserRoleCodes(1L);
        assertEquals(2, roles.size());
        assertTrue(roles.contains("ADMIN"));
        assertTrue(roles.contains("OPERATOR"));
    }
}
