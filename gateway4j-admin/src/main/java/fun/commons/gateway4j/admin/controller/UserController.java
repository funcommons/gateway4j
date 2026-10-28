package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.UserService;
import fun.commons.gateway4j.common.model.User;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/users")
@RequiresToken("BEARER")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /** 与插件列表（D8）一致：分页响应走统一 ApiResponse 信封（data.records / data.total）。 */
    @GetMapping
    public ApiResponse<Page<User>> listUsers(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int pageSize,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(required = false) String keyword) {
        if (pageSize > 100) pageSize = 100;
        return ApiResponse.success(userService.listUsers(page, pageSize, status, keyword));
    }

    @PostMapping
    @Auditable(action = "CREATE_USER", targetType = "USER")
    public User createUser(@RequestBody UserCreateRequest request) {
        User user = User.builder()
                .username(request.username())
                .password(request.password())
                .realName(request.realName())
                .phone(request.phone())
                .build();
        return userService.createUser(user, request.roleCodes());
    }

    @PatchMapping("/{id}")
    @Auditable(action = "UPDATE_USER", targetType = "USER", targetIdSpel = "#id")
    public User updateUser(@PathVariable Long id, @RequestBody UserUpdateRequest request) {
        User user = new User();
        user.setUsername(request.username());
        user.setRealName(request.realName());
        user.setPhone(request.phone());
        user.setStatus(request.status());
        user.setPassword(request.password());
        userService.updateUser(id, user, request.roleCodes());
        return userService.getById(id);
    }

    @DeleteMapping("/{id}")
    @Auditable(action = "DELETE_USER", targetType = "USER", targetIdSpel = "#id")
    public void deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
    }

    @PostMapping("/{id}/reset-password")
    @Auditable(action = "RESET_PASSWORD", targetType = "USER", targetIdSpel = "#id")
    public void resetPassword(@PathVariable Long id, @RequestBody ResetPasswordRequest request) {
        userService.resetPassword(id, request.newPassword());
    }

    public record UserCreateRequest(
            String username, String password, String realName,
            String phone, List<String> roleCodes
    ) {}

    public record UserUpdateRequest(
            String username, String realName, String phone,
            String status, String password, List<String> roleCodes
    ) {}

    public record ResetPasswordRequest(String newPassword) {}
}
