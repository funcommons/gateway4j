package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4f-2 T 步（RED）：GET /v1/users page_size snake_case 绑定回归钉（同款隐患清单 #5）。
 *
 * <p>契约（API_CONTRACT.md 6.x）与前端 misc.ts listUsers 均发 page_size；
 * UserController listUsers 的 @RequestParam 形参为 camelCase pageSize（无显式 name=）→
 * 绑不上 → 恒落默认 20（cap>100 逻辑空转）。修复方向同 PluginController：显式 name="page_size"。</p>
 */
class UserControllerParamBindingTest {

    private UserService userService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userService)).build();
    }

    @Test
    void listUsersBindsSnakeCasePageSize() throws Exception {
        mockMvc.perform(get("/v1/users").param("page_size", "50"))
                .andExpect(status().isOk());

        // 修复前：page_size 绑不上 → 恒落默认 20 → verify 失败（RED）
        verify(userService).listUsers(1, 50, null, null);
    }

    @Test
    void listUsersWithoutParamsKeepsDefaults() throws Exception {
        mockMvc.perform(get("/v1/users"))
                .andExpect(status().isOk());

        // 防回归：不传参数 → 默认 (1, 20, null, null)（修复前后均应绿）
        verify(userService).listUsers(1, 20, null, null);
    }
}
