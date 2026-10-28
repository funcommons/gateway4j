package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiException;
import fun.commons.gateway4j.admin.mapper.PermissionMapper;
import fun.commons.gateway4j.admin.mapper.RoleMapper;
import fun.commons.gateway4j.admin.mapper.RolePermissionRelMapper;
import fun.commons.gateway4j.admin.mapper.UserMapper;
import fun.commons.gateway4j.admin.mapper.UserRoleRelMapper;
import fun.commons.gateway4j.common.model.Permission;
import fun.commons.gateway4j.common.model.Role;
import fun.commons.gateway4j.common.model.RolePermissionRel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class RbacServiceTest {

    @Mock private RoleMapper roleMapper;
    @Mock private PermissionMapper permissionMapper;
    @Mock private RolePermissionRelMapper rolePermissionRelMapper;
    @Mock private UserRoleRelMapper userRoleRelMapper;
    @Mock private UserMapper userMapper;
    @Mock private AuthService authService;

    private RbacService rbacService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        rbacService = new RbacService(roleMapper, permissionMapper, rolePermissionRelMapper,
                userRoleRelMapper, userMapper, authService);
    }

    @Test
    void listRoles() {
        when(roleMapper.selectList(any())).thenReturn(List.of(
                Role.builder().id(1L).roleCode("ROLE_ADMIN").build()));
        List<Role> result = rbacService.listRoles();
        assertEquals(1, result.size());
        assertEquals("ROLE_ADMIN", result.get(0).getRoleCode());
    }

    @Test
    void listPermissionsForUserNoRoles() {
        when(authService.getUserRoleCodes(1L)).thenReturn(List.of());
        List<Permission> result = rbacService.listPermissionsForUser(1L);
        assertTrue(result.isEmpty());
    }

    @Test
    void listPermissionsForUserWithRoles() {
        when(authService.getUserRoleCodes(1L)).thenReturn(List.of("ROLE_ADMIN"));
        when(rolePermissionRelMapper.selectList(any())).thenReturn(List.of(
                RolePermissionRel.builder().roleCode("ROLE_ADMIN").permissionCode("route:read").build()));
        when(permissionMapper.selectList(any())).thenReturn(List.of(
                Permission.builder().id(1L).permissionCode("route:read").build()));
        List<Permission> result = rbacService.listPermissionsForUser(1L);
        assertEquals(1, result.size());
        assertEquals("route:read", result.get(0).getPermissionCode());
    }

    @Test
    void listPermissionsForUserNoPermissionRels() {
        when(authService.getUserRoleCodes(1L)).thenReturn(List.of("ROLE_GUEST"));
        when(rolePermissionRelMapper.selectList(any())).thenReturn(List.of());
        List<Permission> result = rbacService.listPermissionsForUser(1L);
        assertTrue(result.isEmpty());
    }

    // ==================== 角色管理（D16） ====================

    @Test
    void createRole() {
        when(roleMapper.selectOne(any())).thenReturn(null);
        Role result = rbacService.createRole("ROLE_VIEWER", "只读角色", null);
        assertEquals("ROLE_VIEWER", result.getRoleCode());
        verify(roleMapper).insert(any(Role.class));
    }

    @Test
    void createRoleDuplicateCode() {
        when(roleMapper.selectOne(any())).thenReturn(Role.builder().id(1L).roleCode("ROLE_X").build());
        ApiException e = assertThrows(ApiException.class,
                () -> rbacService.createRole("ROLE_X", "x", null));
        assertEquals(ApiCode.UNIQUE_CONFLICT.getCode(), e.getCode());
    }

    @Test
    void updateRole() {
        when(roleMapper.selectById(2L)).thenReturn(Role.builder().id(2L).roleCode("ROLE_X").roleName("old").build());
        Role result = rbacService.updateRole(2L, "new", "remark");
        assertEquals("new", result.getRoleName());
        verify(roleMapper).updateById(any(Role.class));
    }

    @Test
    void updateRoleNotFound() {
        when(roleMapper.selectById(404L)).thenReturn(null);
        ApiException e = assertThrows(ApiException.class, () -> rbacService.updateRole(404L, "n", null));
        assertEquals(ApiCode.NOT_FOUND.getCode(), e.getCode());
    }

    @Test
    void deleteRoleForbiddenForAdmin() {
        when(roleMapper.selectById(1L)).thenReturn(Role.builder().id(1L).roleCode("ROLE_ADMIN").build());
        ApiException e = assertThrows(ApiException.class, () -> rbacService.deleteRole(1L));
        assertEquals(ApiCode.BUSINESS_RULE_ERROR.getCode(), e.getCode());
        verify(roleMapper, never()).deleteById(anyLong());
    }

    @Test
    void deleteRoleForbiddenWhenUsersBound() {
        when(roleMapper.selectById(3L)).thenReturn(Role.builder().id(3L).roleCode("ROLE_DEV").build());
        when(userRoleRelMapper.selectCount(any())).thenReturn(5L);
        ApiException e = assertThrows(ApiException.class, () -> rbacService.deleteRole(3L));
        assertTrue(e.getMessage().contains("5"));
        verify(roleMapper, never()).deleteById(anyLong());
    }

    @Test
    void deleteRole() {
        when(roleMapper.selectById(3L)).thenReturn(Role.builder().id(3L).roleCode("ROLE_DEV").build());
        when(userRoleRelMapper.selectCount(any())).thenReturn(0L);
        rbacService.deleteRole(3L);
        verify(rolePermissionRelMapper).delete(any());
        verify(roleMapper).deleteById(3L);
    }

    @Test
    void replaceRolePermissions() {
        when(roleMapper.selectById(3L)).thenReturn(Role.builder().id(3L).roleCode("ROLE_DEV").build());
        when(rolePermissionRelMapper.selectList(any())).thenReturn(List.of(
                RolePermissionRel.builder().roleCode("ROLE_DEV").permissionCode("route:read").build()));
        List<String> result = rbacService.replaceRolePermissions(3L,
                java.util.Arrays.asList("route:read", "route:edit", null));
        assertEquals(List.of("route:read"), result);
        verify(rolePermissionRelMapper).delete(any());
        verify(rolePermissionRelMapper, times(2)).insert(any(RolePermissionRel.class));
    }

    // ==================== 角色成员管理（阶段二 T6） ====================

    @Test
    void listRoleUsers() {
        when(roleMapper.selectById(2L)).thenReturn(Role.builder().id(2L).roleCode("ROLE_OPS").build());
        when(userRoleRelMapper.selectList(any())).thenReturn(List.of(
                fun.commons.gateway4j.common.model.UserRoleRel.builder()
                        .userId(10L).roleCode("ROLE_OPS").build()));
        when(userMapper.selectByIds(List.of(10L))).thenReturn(List.of(
                fun.commons.gateway4j.common.model.User.builder()
                        .id(10L).username("alice").realName("Alice").build()));

        List<java.util.Map<String, Object>> users = rbacService.listRoleUsers(2L);

        assertEquals(1, users.size());
        assertEquals("alice", users.get(0).get("username"));
        assertEquals("Alice", users.get(0).get("real_name"));
    }

    @Test
    void replaceRoleUsersBindsDistinct() {
        when(roleMapper.selectById(2L)).thenReturn(Role.builder().id(2L).roleCode("ROLE_OPS").build());

        int bound = rbacService.replaceRoleUsers(2L, java.util.Arrays.asList(10L, 11L, 10L, null));

        assertEquals(2, bound);
        verify(userRoleRelMapper).delete(any());
        verify(userRoleRelMapper, times(2)).insert(any(fun.commons.gateway4j.common.model.UserRoleRel.class));
    }

    @Test
    void replaceRoleUsersUnbindAll() {
        when(roleMapper.selectById(2L)).thenReturn(Role.builder().id(2L).roleCode("ROLE_OPS").build());

        int bound = rbacService.replaceRoleUsers(2L, null);

        assertEquals(0, bound);
        verify(userRoleRelMapper).delete(any());
        verify(userRoleRelMapper, never()).insert(any(fun.commons.gateway4j.common.model.UserRoleRel.class));
    }

    @Test
    void roleMemberOpsRequireExistingRole() {
        when(roleMapper.selectById(404L)).thenReturn(null);
        assertThrows(ApiException.class, () -> rbacService.listRoleUsers(404L));
        assertThrows(ApiException.class, () -> rbacService.replaceRoleUsers(404L, List.of(1L)));
    }
}
