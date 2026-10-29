package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.gateway4j.admin.service.BuiltinPluginTypeService;
import fun.commons.gateway4j.admin.service.PluginService;
import fun.commons.gateway4j.admin.service.PluginUploadService;
import fun.commons.gateway4j.common.model.Plugin;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PluginControllerTest {

    @Mock private PluginService pluginService;
    @Mock private BuiltinPluginTypeService builtinPluginTypeService;
    @Mock private PluginUploadService pluginUploadService;
    @InjectMocks private PluginController controller;

    @Test
    void listPlugins() {
        Page<Plugin> page = new Page<>(1, 20);
        when(pluginService.listPlugins(1, 20, null, null, null, null, null)).thenReturn(page);

        var result = controller.listPlugins(1, 20, null, null, null, null, null);
        assertNotNull(result);
        assertEquals(0, result.getCode());
        assertEquals(page, result.getData());
        verify(pluginService).listPlugins(1, 20, null, null, null, null, null);
    }

    @Test
    void listPluginsWithKeyword() {
        Page<Plugin> page = new Page<>(1, 20);
        when(pluginService.listPlugins(1, 20, null, null, null, null, "rate")).thenReturn(page);

        controller.listPlugins(1, 20, null, null, null, null, "rate");
        verify(pluginService).listPlugins(1, 20, null, null, null, null, "rate");
    }

    @Test
    void listPluginsPageSizeCappedAt100() {
        Page<Plugin> page = new Page<>(1, 100);
        when(pluginService.listPlugins(1, 100, null, null, null, null, null)).thenReturn(page);

        controller.listPlugins(1, 200, null, null, null, null, null);
        verify(pluginService).listPlugins(1, 100, null, null, null, null, null);
    }

    @Test
    void createPlugin() {
        Plugin plugin = Plugin.builder().id(1L).pluginName("test").pluginId("test-id").build();
        when(pluginService.createPlugin(any(Plugin.class), any(), any())).thenReturn(plugin);

        PluginController.PluginCreateRequest request = new PluginController.PluginCreateRequest(
                "test", "test-id", "BUILTIN", "PRE", "ROUTE", 0, "{}", null, null, null);
        Plugin result = controller.createPlugin(request);
        assertNotNull(result);
    }

    @Test
    void getPluginDetail() {
        // 契约缺口修复：前端 plugins.ts getPlugin(id)（编辑页生产调用）
        Map<String, Object> detail = Map.of(
                "id", "1",
                "plugin_name", "groovy-x",
                "script_content", "def x = 1");
        when(pluginService.getPluginDetail(1L)).thenReturn(detail);

        Map<String, Object> result = controller.getPlugin(1L);
        assertEquals("groovy-x", result.get("plugin_name"));
        assertEquals("def x = 1", result.get("script_content"));
        verify(pluginService).getPluginDetail(1L);
    }

    @Test
    void updatePlugin() {
        Plugin existing = Plugin.builder().id(1L).pluginName("old").build();
        when(pluginService.getById(1L)).thenReturn(existing);

        PluginController.PluginUpdateRequest request = new PluginController.PluginUpdateRequest(
                "new-name", null, null, null, null);
        Plugin result = controller.updatePlugin(1L, request);
        verify(pluginService).updatePlugin(any(Plugin.class), eq(null));
    }

    @Test
    void updatePluginPassesScriptContentThrough() {
        // P2-1：PATCH 请求里的 script_content 透传到 service（落 gw_plugin_groovy）
        Plugin existing = Plugin.builder().id(1L).pluginName("g").pluginType("GROOVY").build();
        when(pluginService.getById(1L)).thenReturn(existing);

        PluginController.PluginUpdateRequest request = new PluginController.PluginUpdateRequest(
                null, null, null, null, "def y = 2");
        controller.updatePlugin(1L, request);
        verify(pluginService).updatePlugin(any(Plugin.class), eq("def y = 2"));
    }

    @Test
    void deletePlugin() {
        controller.deletePlugin(1L);
        verify(pluginService).deletePlugin(1L);
    }

    @Test
    void enablePlugin() {
        Plugin plugin = Plugin.builder().id(1L).status("ENABLED").build();
        when(pluginService.enablePlugin(1L)).thenReturn(plugin);

        Plugin result = controller.enablePlugin(1L);
        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void disablePlugin() {
        Plugin plugin = Plugin.builder().id(1L).status("DISABLED").build();
        when(pluginService.disablePlugin(1L)).thenReturn(plugin);

        Plugin result = controller.disablePlugin(1L);
        assertEquals("DISABLED", result.getStatus());
    }

    @Test
    void listGlobalPlugins() {
        when(pluginService.listGlobalPlugins("PRE")).thenReturn(List.of());
        List<Plugin> result = controller.listGlobalPlugins("PRE");
        assertNotNull(result);
    }

    @Test
    void sortGlobalPlugins() {
        PluginController.GlobalSortRequest request = new PluginController.GlobalSortRequest(
                "PRE", List.of(1L, 2L));
        controller.sortGlobalPlugins(request);
        verify(pluginService).sortGlobalPlugins("PRE", List.of(1L, 2L));
    }

    @Test
    void listBuiltinTypes() {
        when(builtinPluginTypeService.listTypes()).thenReturn(List.of(Map.of("plugin_id", "jwt")));
        List<Map<String, Object>> result = controller.listBuiltinTypes();
        assertEquals(1, result.size());
        verify(builtinPluginTypeService).listTypes();
    }

    @Test
    void getBuiltinSchema() {
        when(builtinPluginTypeService.getSchema("jwt")).thenReturn(Map.of("plugin_id", "jwt"));
        Map<String, Object> result = controller.getBuiltinSchema("jwt");
        assertEquals("jwt", result.get("plugin_id"));
        verify(builtinPluginTypeService).getSchema("jwt");
    }

    @Test
    void validateConfig() {
        when(builtinPluginTypeService.validateConfig("jwt", "{}"))
                .thenReturn(Map.of("is_valid", true, "errors", List.of()));
        Map<String, Object> result = controller.validateConfig(
                new PluginController.ValidateConfigRequest("jwt", "{}"));
        assertEquals(true, result.get("is_valid"));
        verify(builtinPluginTypeService).validateConfig("jwt", "{}");
    }

    @Test
    void uploadJar() {
        MockMultipartFile file = new MockMultipartFile("file", "plugin.jar", "application/java-archive",
                "fake-jar".getBytes());
        Plugin plugin = Plugin.builder().id(1L).pluginId("my-plugin").pluginType("JAR").build();
        when(pluginUploadService.uploadJar(any(), eq("my-plugin"), eq("my-plugin"), eq("PRE"),
                isNull(), isNull(), isNull())).thenReturn(plugin);

        Plugin result = controller.uploadJar(file, "my-plugin", "my-plugin", "PRE", null, null, null);
        assertEquals("JAR", result.getPluginType());
        verify(pluginUploadService).uploadJar(any(), eq("my-plugin"), eq("my-plugin"), eq("PRE"),
                isNull(), isNull(), isNull());
    }

    @Test
    void validateGroovy() {
        when(pluginUploadService.validateGroovy("def x = 1"))
                .thenReturn(Map.of("is_valid", true, "error_line", 0, "error_message", ""));
        Map<String, Object> result = controller.validateGroovy(
                new PluginController.ValidateGroovyRequest("def x = 1"));
        assertEquals(true, result.get("is_valid"));
        verify(pluginUploadService).validateGroovy("def x = 1");
    }
}
