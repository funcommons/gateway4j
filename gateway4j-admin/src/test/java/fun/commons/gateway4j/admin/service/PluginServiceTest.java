package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.PluginGroupItemMapper;
import fun.commons.gateway4j.admin.mapper.PluginGroovyMapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.PluginGroupItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PluginServiceTest {

    @Mock private PluginMapper pluginMapper;
    @Mock private PluginGroupItemMapper groupItemMapper;
    @Mock private PluginGroovyMapper groovyMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private ApplicationEventPublisher eventPublisher;

    private PluginService pluginService;

    private Plugin testPlugin;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        pluginService = new PluginService(groupItemMapper, groovyMapper, bindingMapper, eventPublisher);
        setBaseMapper(pluginService, pluginMapper);

        testPlugin = Plugin.builder()
                .id(1L).pluginName("test-plugin").pluginId("test-plugin-id")
                .pluginType("BUILTIN").pluginPhase("PRE")
                .scope("ROUTE").status("DISABLED").sortOrder(0).config("{}")
                .build();
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
    void createPluginSuccess() {
        when(pluginMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(pluginMapper.insert(any(Plugin.class))).thenAnswer(invocation -> {
            Plugin p = invocation.getArgument(0);
            p.setId(1L);
            return 1;
        });

        Plugin result = pluginService.createPlugin(testPlugin, null, null);
        assertNotNull(result);
        verify(pluginMapper).insert(testPlugin);
    }

    @Test
    void createPluginDuplicateIdThrows() {
        when(pluginMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        assertThrows(BusinessException.class, () -> pluginService.createPlugin(testPlugin, null, null));
    }

    @Test
    void createGroupPluginWithMembers() {
        testPlugin.setPluginType("GROUP");
        when(pluginMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(pluginMapper.insert(any(Plugin.class))).thenAnswer(invocation -> {
            Plugin p = invocation.getArgument(0);
            p.setId(1L);
            return 1;
        });

        Plugin result = pluginService.createPlugin(testPlugin, List.of(2L, 3L), null);
        assertNotNull(result);
        verify(groupItemMapper, times(2)).insert(any(PluginGroupItem.class));
    }

    @Test
    void createGroupPluginWithoutMembersThrows() {
        testPlugin.setPluginType("GROUP");
        assertThrows(BusinessException.class, () -> pluginService.createPlugin(testPlugin, null, null));
    }

    @Test
    void createPluginWithoutNameThrows() {
        testPlugin.setPluginName(null);
        assertThrows(BusinessException.class, () -> pluginService.createPlugin(testPlugin, null, null));
    }

    @Test
    void createPluginWithoutPluginIdThrows() {
        testPlugin.setPluginId(null);
        assertThrows(BusinessException.class, () -> pluginService.createPlugin(testPlugin, null, null));
    }

    @Test
    void updatePluginSuccess() {
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        Plugin update = new Plugin();
        update.setId(1L);
        update.setPluginName("updated-name");
        pluginService.updatePlugin(update);

        verify(pluginMapper).updateById(any(Plugin.class));
    }

    @Test
    void updatePluginNotFound() {
        when(pluginMapper.selectById(999L)).thenReturn(null);

        Plugin update = new Plugin();
        update.setId(999L);
        assertThrows(BusinessException.class, () -> pluginService.updatePlugin(update));
    }

    @Test
    void deleteBuiltinPluginThrows() {
        testPlugin.setPluginType("BUILTIN");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);

        assertThrows(BusinessException.class, () -> pluginService.deletePlugin(1L));
    }

    @Test
    void deleteEnabledPluginThrows() {
        testPlugin.setPluginType("JAR");
        testPlugin.setStatus("ENABLED");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);

        assertThrows(BusinessException.class, () -> pluginService.deletePlugin(1L));
    }

    @Test
    void deleteDisabledJarPluginSuccess() {
        testPlugin.setPluginType("JAR");
        testPlugin.setStatus("DISABLED");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.deleteById(1L)).thenReturn(1);

        pluginService.deletePlugin(1L);
        verify(pluginMapper).deleteById(1L);
        verify(groupItemMapper).delete(any(LambdaQueryWrapper.class));
        verify(bindingMapper).delete(any(LambdaQueryWrapper.class));
    }

    @Test
    void enablePluginSuccess() {
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        Plugin result = pluginService.enablePlugin(1L);
        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void enableAlreadyEnabledPluginThrows() {
        testPlugin.setStatus("ENABLED");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);

        assertThrows(BusinessException.class, () -> pluginService.enablePlugin(1L));
    }

    @Test
    void disablePluginSuccess() {
        testPlugin.setStatus("ENABLED");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        Plugin result = pluginService.disablePlugin(1L);
        assertEquals("DISABLED", result.getStatus());
    }

    @Test
    void disableAlreadyDisabledPluginThrows() {
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);

        assertThrows(BusinessException.class, () -> pluginService.disablePlugin(1L));
    }

    @Test
    void sortGlobalPlugins() {
        Plugin p1 = Plugin.builder().id(1L).scope("GLOBAL").sortOrder(0).build();
        Plugin p2 = Plugin.builder().id(2L).scope("GLOBAL").sortOrder(1).build();

        when(pluginMapper.selectById(1L)).thenReturn(p1);
        when(pluginMapper.selectById(2L)).thenReturn(p2);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        pluginService.sortGlobalPlugins("PRE", List.of(2L, 1L));

        assertEquals(0, p2.getSortOrder());
        assertEquals(1, p1.getSortOrder());
        verify(pluginMapper, times(2)).updateById(any(Plugin.class));
    }

    @Test
    void sortGlobalPluginsWithoutPhaseThrows() {
        assertThrows(BusinessException.class, () -> pluginService.sortGlobalPlugins(null, List.of(1L)));
    }

    @Test
    void getPluginDetailReturnsGroovyScriptContent() {
        // T0 契约缺口：GET /v1/plugins/{id} 须带 GROOVY 的 script_content
        Plugin groovyPlugin = Plugin.builder().id(7L).pluginName("g").pluginId("g-id")
                .pluginType("GROOVY").pluginPhase("PRE").config("{}").build();
        when(pluginMapper.selectById(7L)).thenReturn(groovyPlugin);
        when(groovyMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(
                fun.commons.gateway4j.common.model.PluginGroovy.builder()
                        .pluginId(7L).scriptContent("def x = 1").scriptMd5("md5").build());

        Map<String, Object> detail = pluginService.getPluginDetail(7L);

        assertEquals("g", detail.get("plugin_name"));
        assertEquals("def x = 1", detail.get("script_content"));
    }

    @Test
    void getPluginDetailNonGroovyOmitsScript() {
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);

        Map<String, Object> detail = pluginService.getPluginDetail(1L);

        assertFalse(detail.containsKey("script_content"));
        assertEquals("test-plugin", detail.get("plugin_name"));
    }

    @Test
    void getPluginDetailNotFoundThrows() {
        when(pluginMapper.selectById(404L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> pluginService.getPluginDetail(404L));
    }

    // ==================== T2：写操作发布 ConfigChangeEvent（驱动 Redis 配置广播） ====================

    @Test
    void createPluginPublishesChangeEvent() {
        when(pluginMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0L);
        when(pluginMapper.insert(any(Plugin.class))).thenAnswer(invocation -> {
            Plugin p = invocation.getArgument(0);
            p.setId(1L);
            return 1;
        });

        pluginService.createPlugin(testPlugin, null, null);

        ArgumentCaptor<fun.commons.gateway4j.engine.config.event.ConfigChangeEvent> eventCaptor =
                ArgumentCaptor.forClass(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertEvent(eventCaptor.getValue(), "PLUGIN", 1L, "CREATE");
    }

    @Test
    void updatePluginPublishesChangeEvent() {
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        Plugin update = new Plugin();
        update.setId(1L);
        update.setPluginName("updated-name");
        pluginService.updatePlugin(update);

        ArgumentCaptor<fun.commons.gateway4j.engine.config.event.ConfigChangeEvent> eventCaptor =
                ArgumentCaptor.forClass(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertEvent(eventCaptor.getValue(), "PLUGIN", 1L, "UPDATE");
    }

    @Test
    void deleteDisabledPluginPublishesChangeEvent() {
        testPlugin.setPluginType("JAR");
        testPlugin.setStatus("DISABLED");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.deleteById(1L)).thenReturn(1);

        pluginService.deletePlugin(1L);

        ArgumentCaptor<fun.commons.gateway4j.engine.config.event.ConfigChangeEvent> eventCaptor =
                ArgumentCaptor.forClass(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertEvent(eventCaptor.getValue(), "PLUGIN", 1L, "DELETE");
    }

    @Test
    void enableGlobalPluginPublishesGlobalPluginEvent() {
        testPlugin.setScope("GLOBAL");
        when(pluginMapper.selectById(1L)).thenReturn(testPlugin);
        when(pluginMapper.updateById(any(Plugin.class))).thenReturn(1);

        pluginService.enablePlugin(1L);

        ArgumentCaptor<fun.commons.gateway4j.engine.config.event.ConfigChangeEvent> eventCaptor =
                ArgumentCaptor.forClass(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertEvent(eventCaptor.getValue(), "GLOBAL_PLUGIN", 1L, "ENABLE");
    }

    private void assertEvent(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent event,
                             String expectedConfigType, Long expectedId, String expectedChangeType) {
        assertEquals(expectedConfigType, event.getConfigType());
        assertEquals(expectedId, event.getConfigId());
        assertEquals(expectedChangeType, event.getChangeType());
    }
}
