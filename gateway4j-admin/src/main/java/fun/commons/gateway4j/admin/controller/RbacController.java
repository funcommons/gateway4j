package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.gateway4j.admin.service.RbacService;
import fun.commons.gateway4j.common.model.Permission;
import fun.commons.gateway4j.common.model.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1")
@RequiresToken("BEARER")
public class RbacController {

    private final RbacService rbacService;

    public RbacController(RbacService rbacService) {
        this.rbacService = rbacService;
    }

    @GetMapping("/roles")
    public List<Role> listRoles() {
        return rbacService.listRoles();
    }

    @GetMapping("/permissions")
    public List<Permission> listPermissions() {
        Object userId = TokenContext.getClaim("user_id");
        if (userId == null) {
            userId = TokenContext.getClaim("sub");
        }
        if (userId == null) {
            return List.of();
        }
        return rbacService.listPermissionsForUser(Long.valueOf(String.valueOf(userId)));
    }

    // ==================== 角色管理（修复 D16） ====================

    @PostMapping("/roles")
    @Auditable(action = "CREATE_ROLE", targetType = "ROLE")
    public Role createRole(@Valid @RequestBody RoleCreateRequest request) {
        return rbacService.createRole(request.roleCode(), request.roleName(), request.remark());
    }

    @PutMapping("/roles/{id}")
    @Auditable(action = "UPDATE_ROLE", targetType = "ROLE", targetIdSpel = "#id")
    public Role updateRole(@PathVariable Long id, @Valid @RequestBody RoleUpdateRequest request) {
        return rbacService.updateRole(id, request.roleName(), request.remark());
    }

    @DeleteMapping("/roles/{id}")
    @Auditable(action = "DELETE_ROLE", targetType = "ROLE", targetIdSpel = "#id")
    public void deleteRole(@PathVariable Long id) {
        rbacService.deleteRole(id);
    }

    @GetMapping("/roles/{id}/permissions")
    public List<String> listRolePermissions(@PathVariable Long id) {
        return rbacService.listRolePermissions(id);
    }

    @PutMapping("/roles/{id}/permissions")
    @Auditable(action = "ASSIGN_ROLE_PERMISSIONS", targetType = "ROLE", targetIdSpel = "#id")
    public List<String> replaceRolePermissions(@PathVariable Long id,
                                               @RequestBody RolePermissionsRequest request) {
        return rbacService.replaceRolePermissions(id, request.permissionCodes());
    }

    // ==================== 角色成员管理（阶段二 T6） ====================

    @GetMapping("/roles/{id}/users")
    public List<Map<String, Object>> listRoleUsers(@PathVariable Long id) {
        return rbacService.listRoleUsers(id);
    }

    @PutMapping("/roles/{id}/users")
    @Auditable(action = "ASSIGN_ROLE_USERS", targetType = "ROLE", targetIdSpel = "#id")
    public Map<String, Object> replaceRoleUsers(@PathVariable Long id,
                                                @RequestBody RoleUsersRequest request) {
        int bound = rbacService.replaceRoleUsers(id, request.userIds());
        return Map.of("bound", bound);
    }

    public record RoleCreateRequest(
            @NotBlank(message = "角色编码不能为空")
            @Pattern(regexp = "^[A-Z0-9_]{2,50}$", message = "角色编码须为 2-50 位大写字母、数字或下划线")
            String roleCode,
            @NotBlank(message = "角色名称不能为空")
            @Size(max = 50, message = "角色名称最长 50 字符")
            String roleName,
            @Size(max = 200, message = "备注最长 200 字符")
            String remark
    ) {}

    public record RoleUpdateRequest(
            @NotBlank(message = "角色名称不能为空")
            @Size(max = 50, message = "角色名称最长 50 字符")
            String roleName,
            @Size(max = 200, message = "备注最长 200 字符")
            String remark
    ) {}

    public record RolePermissionsRequest(List<String> permissionCodes) {}

    public record RoleUsersRequest(List<Long> userIds) {}
}
