package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import fun.commons.gateway4j.common.model.User;
import fun.commons.gateway4j.common.model.UserRoleRel;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class RbacService {

    private final RoleMapper roleMapper;
    private final PermissionMapper permissionMapper;
    private final RolePermissionRelMapper rolePermissionRelMapper;
    private final UserRoleRelMapper userRoleRelMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public RbacService(RoleMapper roleMapper, PermissionMapper permissionMapper,
                       RolePermissionRelMapper rolePermissionRelMapper,
                       UserRoleRelMapper userRoleRelMapper, UserMapper userMapper,
                       AuthService authService) {
        this.roleMapper = roleMapper;
        this.permissionMapper = permissionMapper;
        this.rolePermissionRelMapper = rolePermissionRelMapper;
        this.userRoleRelMapper = userRoleRelMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    public List<Role> listRoles() {
        return roleMapper.selectList(new LambdaQueryWrapper<Role>().orderByAsc(Role::getId));
    }

    public List<Permission> listPermissionsForUser(Long userId) {
        List<String> roleCodes = authService.getUserRoleCodes(userId);
        if (roleCodes.isEmpty()) {
            return List.of();
        }
        List<RolePermissionRel> rels = rolePermissionRelMapper.selectList(
                new LambdaQueryWrapper<RolePermissionRel>().in(RolePermissionRel::getRoleCode, roleCodes));
        List<String> permCodes = rels.stream().map(RolePermissionRel::getPermissionCode).distinct().toList();
        if (permCodes.isEmpty()) {
            return List.of();
        }
        return permissionMapper.selectList(
                new LambdaQueryWrapper<Permission>().in(Permission::getPermissionCode, permCodes)
                        .orderByAsc(Permission::getSortOrder));
    }

    // ==================== 角色 CRUD（修复 D16） ====================

    public Role createRole(String roleCode, String roleName, String remark) {
        if (findByCode(roleCode) != null) {
            throw new ApiException(ApiCode.UNIQUE_CONFLICT, "角色编码已存在: " + roleCode);
        }
        Role role = Role.builder()
                .roleCode(roleCode)
                .roleName(roleName)
                .remark(remark)
                .build();
        roleMapper.insert(role);
        return role;
    }

    public Role updateRole(Long roleId, String roleName, String remark) {
        Role existing = requireRole(roleId);
        if (roleName != null) {
            existing.setRoleName(roleName);
        }
        if (remark != null) {
            existing.setRemark(remark);
        }
        roleMapper.updateById(existing);
        return existing;
    }

    @Transactional
    public void deleteRole(Long roleId) {
        Role existing = requireRole(roleId);
        if ("ROLE_ADMIN".equals(existing.getRoleCode())) {
            throw new ApiException(ApiCode.BUSINESS_RULE_ERROR, "内置超级管理员角色不可删除");
        }
        Long userCount = userRoleRelMapper.selectCount(new LambdaQueryWrapper<UserRoleRel>()
                .eq(UserRoleRel::getRoleCode, existing.getRoleCode()));
        if (userCount > 0) {
            throw new ApiException(ApiCode.BUSINESS_RULE_ERROR,
                    "角色已关联 " + userCount + " 个用户，请先解除绑定再删除");
        }
        rolePermissionRelMapper.delete(new LambdaQueryWrapper<RolePermissionRel>()
                .eq(RolePermissionRel::getRoleCode, existing.getRoleCode()));
        roleMapper.deleteById(roleId);
    }

    public List<String> listRolePermissions(Long roleId) {
        Role role = requireRole(roleId);
        return rolePermissionRelMapper.selectList(new LambdaQueryWrapper<RolePermissionRel>()
                        .eq(RolePermissionRel::getRoleCode, role.getRoleCode()))
                .stream()
                .map(RolePermissionRel::getPermissionCode)
                .distinct()
                .toList();
    }

    @Transactional
    public List<String> replaceRolePermissions(Long roleId, List<String> permissionCodes) {
        Role role = requireRole(roleId);
        rolePermissionRelMapper.delete(new LambdaQueryWrapper<RolePermissionRel>()
                .eq(RolePermissionRel::getRoleCode, role.getRoleCode()));
        if (permissionCodes != null && !permissionCodes.isEmpty()) {
            Set<String> distinct = new LinkedHashSet<>(permissionCodes.stream()
                    .filter(c -> c != null && !c.isBlank()).toList());
            for (String code : distinct) {
                rolePermissionRelMapper.insert(RolePermissionRel.builder()
                        .roleCode(role.getRoleCode())
                        .permissionCode(code)
                        .build());
            }
        }
        return listRolePermissions(roleId);
    }

    private Role requireRole(Long roleId) {
        Role role = roleMapper.selectById(roleId);
        if (role == null) {
            throw new ApiException(ApiCode.NOT_FOUND, "角色未找到: " + roleId);
        }
        return role;
    }

    // ==================== 角色成员管理（阶段二 T6） ====================

    /** 该角色用户简表 [{id, username, real_name}]。 */
    public List<Map<String, Object>> listRoleUsers(Long roleId) {
        Role role = requireRole(roleId);
        List<UserRoleRel> rels = userRoleRelMapper.selectList(new LambdaQueryWrapper<UserRoleRel>()
                .eq(UserRoleRel::getRoleCode, role.getRoleCode()));
        if (rels.isEmpty()) {
            return List.of();
        }
        List<Long> userIds = rels.stream().map(UserRoleRel::getUserId).distinct().toList();
        Map<Long, User> userById = new LinkedHashMap<>();
        for (User u : userMapper.selectByIds(userIds)) {
            userById.put(u.getId(), u);
        }
        List<Map<String, Object>> users = new java.util.ArrayList<>();
        for (Long userId : userIds) {
            User u = userById.get(userId);
            if (u == null) {
                continue; // 用户已被删除
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", String.valueOf(u.getId()));
            item.put("username", u.getUsername());
            item.put("real_name", u.getRealName());
            users.add(item);
        }
        return users;
    }

    /** 全量替换该角色的用户绑定，返回绑定数。 */
    @Transactional
    public int replaceRoleUsers(Long roleId, List<Long> userIds) {
        Role role = requireRole(roleId);
        userRoleRelMapper.delete(new LambdaQueryWrapper<UserRoleRel>()
                .eq(UserRoleRel::getRoleCode, role.getRoleCode()));
        int bound = 0;
        if (userIds != null) {
            Set<Long> distinct = new LinkedHashSet<>(userIds.stream()
                    .filter(java.util.Objects::nonNull).toList());
            for (Long userId : distinct) {
                userRoleRelMapper.insert(UserRoleRel.builder()
                        .userId(userId)
                        .roleCode(role.getRoleCode())
                        .build());
                bound++;
            }
        }
        return bound;
    }

    private Role findByCode(String roleCode) {
        if (roleCode == null) {
            return null;
        }
        return roleMapper.selectOne(new LambdaQueryWrapper<Role>()
                .eq(Role::getRoleCode, roleCode));
    }
}
