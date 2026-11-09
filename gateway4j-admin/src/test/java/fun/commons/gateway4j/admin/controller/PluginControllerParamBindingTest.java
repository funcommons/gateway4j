package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.gateway4j.admin.service.BuiltinPluginTypeService;
import fun.commons.gateway4j.admin.service.PluginService;
import fun.commons.gateway4j.admin.service.PluginUploadService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4f-2 T 步（RED）：GET /v1/plugins 查询参数 snake_case 绑定回归钉。
 *
 * <p>缺陷（契约 §4.5 P4e 行）：全站调用方/契约发 snake_case（plugin_type/plugin_phase/page_size），
 * PluginController listPlugins 的 @RequestParam 形参为 camelCase（pluginType/pluginPhase/pageSize）
 * 且无显式 name=，Spring 按形参名绑定 → snake_case 实参绑不上 → null → Service 过滤静默失效
 * （三类型查询返回同一页，total 恒 32 首页掺杂）。</p>
 *
 * <p>既有 PluginControllerTest 为 @InjectMocks 直调 controller 方法，绕过 HTTP 绑定层，抓不到本缺陷；
 * 本测试走 standalone MockMvc 真实经过 RequestParam 绑定，再以 Mockito verify 捕获 Service 实参。
 * 修复方向：@RequestParam 显式 name="plugin_type"（phase/page_size 同理）。</p>
 */
class PluginControllerParamBindingTest {

    private PluginService pluginService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        pluginService = mock(PluginService.class);
        PluginController controller = new PluginController(pluginService,
                mock(BuiltinPluginTypeService.class), mock(PluginUploadService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void listPluginsBindsSnakeCasePluginType() throws Exception {
        mockMvc.perform(get("/v1/plugins").param("plugin_type", "BUILTIN"))
                .andExpect(status().isOk());

        // 修复前：Controller 绑 camelCase pluginType → 收到 null → verify 失败（RED）
        verify(pluginService).listPlugins(1, 20, "BUILTIN", null, null, null, null);
    }

    @Test
    void listPluginsBindsSnakeCasePluginPhase() throws Exception {
        mockMvc.perform(get("/v1/plugins").param("plugin_phase", "PRE"))
                .andExpect(status().isOk());

        // 修复前：收到 null（RED）
        verify(pluginService).listPlugins(1, 20, null, "PRE", null, null, null);
    }

    @Test
    void listPluginsBindsSnakeCasePageSize() throws Exception {
        mockMvc.perform(get("/v1/plugins").param("page_size", "50"))
                .andExpect(status().isOk());

        // 修复前：page_size 绑不上 → 恒落默认 20 → verify 失败（RED）
        verify(pluginService).listPlugins(1, 50, null, null, null, null, null);
    }

    @Test
    void listGlobalPluginsBindsSnakeCasePluginPhase() throws Exception {
        mockMvc.perform(get("/v1/plugins/global").param("plugin_phase", "PRE"))
                .andExpect(status().isOk());

        // 修复前：/global 的 pluginPhase 同样 camelCase 绑定 → 收到 null → verify 失败（RED）
        verify(pluginService).listGlobalPlugins("PRE");
    }

    @Test
    void listPluginsWithoutParamsKeepsDefaults() throws Exception {
        mockMvc.perform(get("/v1/plugins"))
                .andExpect(status().isOk());

        // 防回归：不传参数 → (1, 20, null…) 默认语义不变（本用例修复前后均应绿）
        verify(pluginService).listPlugins(1, 20, null, null, null, null, null);
    }
}
