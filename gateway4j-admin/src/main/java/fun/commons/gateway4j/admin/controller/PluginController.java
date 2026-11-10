package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.framework4j.ratelimit.annotation.RateLimit;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.BuiltinPluginTypeService;
import fun.commons.gateway4j.admin.service.PluginService;
import fun.commons.gateway4j.admin.service.PluginUploadService;
import fun.commons.gateway4j.common.model.Plugin;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/plugins")
@RequiresToken("BEARER")
public class PluginController {

    private final PluginService pluginService;
    private final BuiltinPluginTypeService builtinPluginTypeService;
    private final PluginUploadService pluginUploadService;

    public PluginController(PluginService pluginService, BuiltinPluginTypeService builtinPluginTypeService,
                            PluginUploadService pluginUploadService) {
        this.pluginService = pluginService;
        this.builtinPluginTypeService = builtinPluginTypeService;
        this.pluginUploadService = pluginUploadService;
    }

    /** 修复 D8：统一 ApiResponse 信封（data.records / data.total）；修复 D6：keyword 过滤生效。 */
    @GetMapping
    public ApiResponse<Page<Plugin>> listPlugins(@RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
                                                 @RequestParam(name = "plugin_type", required = false) String pluginType,
                                                 @RequestParam(name = "plugin_phase", required = false) String pluginPhase,
                                                 @RequestParam(required = false) String scope,
                                                 @RequestParam(required = false) String status,
                                                 @RequestParam(required = false) String keyword) {
        if (pageSize > 100) pageSize = 100;
        return ApiResponse.success(
                pluginService.listPlugins(page, pageSize, pluginType, pluginPhase, scope, status, keyword));
    }

    /** 插件详情（契约缺口修复：前端 plugins.ts getPlugin(id)，编辑页 Editor.vue 生产调用）。 */
    @GetMapping("/{id}")
    public Map<String, Object> getPlugin(@PathVariable Long id) {
        return pluginService.getPluginDetail(id);
    }

    @PostMapping
    @Auditable(action = "CREATE_PLUGIN", targetType = "PLUGIN")
    public Plugin createPlugin(@RequestBody PluginCreateRequest request) {
        Plugin plugin = Plugin.builder()
                .pluginName(request.pluginName())
                .pluginId(request.pluginId())
                .pluginType(request.pluginType())
                .pluginPhase(request.pluginPhase())
                .scope(request.scope() != null ? request.scope() : "ROUTE")
                .sortOrder(request.sortOrder() != null ? request.sortOrder() : 0)
                .config(request.config() != null ? request.config() : "{}")
                .remark(request.remark())
                .build();
        return pluginService.createPlugin(plugin, request.groupMemberIds(), request.scriptContent());
    }

    @PatchMapping("/{id}")
    @Auditable(action = "UPDATE_PLUGIN", targetType = "PLUGIN", targetIdSpel = "#id")
    public Plugin updatePlugin(@PathVariable Long id, @RequestBody PluginUpdateRequest request) {
        Plugin plugin = new Plugin();
        plugin.setId(id);
        if (request.pluginName() != null) plugin.setPluginName(request.pluginName());
        if (request.config() != null) plugin.setConfig(request.config());
        if (request.sortOrder() != null) plugin.setSortOrder(request.sortOrder());
        if (request.remark() != null) plugin.setRemark(request.remark());
        // P2-1：script_content 非 null 时覆盖 gw_plugin_groovy（null = 本次不涉及脚本）
        pluginService.updatePlugin(plugin, request.scriptContent());
        return pluginService.getById(id);
    }

    @DeleteMapping("/{id}")
    @Auditable(action = "DELETE_PLUGIN", targetType = "PLUGIN", targetIdSpel = "#id")
    public void deletePlugin(@PathVariable Long id) {
        pluginService.deletePlugin(id);
    }

    @PostMapping("/{id}/enable")
    @Auditable(action = "ENABLE_PLUGIN", targetType = "PLUGIN", targetIdSpel = "#id")
    public Plugin enablePlugin(@PathVariable Long id) {
        return pluginService.enablePlugin(id);
    }

    @PostMapping("/{id}/disable")
    @Auditable(action = "DISABLE_PLUGIN", targetType = "PLUGIN", targetIdSpel = "#id")
    public Plugin disablePlugin(@PathVariable Long id) {
        return pluginService.disablePlugin(id);
    }

    /**
     * @deprecated UI 已迁 /v2 插件链全局泳道（取数走 {@code GET /v1/plugins?scope=GLOBAL}），
     *             前端客户端已随 P4f-C2 拆除（api/plugins.ts），无调用方；
     *             端点保留至外部调用方确认后移除。
     */
    @Deprecated
    @GetMapping("/global")
    public List<Plugin> listGlobalPlugins(@RequestParam(name = "plugin_phase", required = false) String pluginPhase) {
        return pluginService.listGlobalPlugins(pluginPhase);
    }

    @PutMapping("/global/sort")
    @Auditable(action = "SORT_GLOBAL_PLUGINS", targetType = "PLUGIN")
    public void sortGlobalPlugins(@RequestBody GlobalSortRequest request) {
        pluginService.sortGlobalPlugins(request.pluginPhase(), request.pluginIds());
    }

    @GetMapping("/builtin-types")
    public List<Map<String, Object>> listBuiltinTypes() {
        return builtinPluginTypeService.listTypes();
    }

    @GetMapping("/builtin-types/{pluginId}/schema")
    public Map<String, Object> getBuiltinSchema(@PathVariable String pluginId) {
        return builtinPluginTypeService.getSchema(pluginId);
    }

    @PostMapping("/validate-config")
    public Map<String, Object> validateConfig(@RequestBody ValidateConfigRequest request) {
        return builtinPluginTypeService.validateConfig(request.pluginId(), request.config());
    }

    @PostMapping(value = "/upload-jar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Auditable(action = "UPLOAD_JAR", targetType = "PLUGIN")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Plugin uploadJar(@RequestPart("file") MultipartFile file,
                            @RequestParam("plugin_name") String pluginName,
                            @RequestParam("plugin_id") String pluginId,
                            @RequestParam("plugin_phase") String pluginPhase,
                            @RequestParam(value = "scope", required = false) String scope,
                            @RequestParam(value = "config", required = false) String config,
                            @RequestParam(value = "remark", required = false) String remark) {
        return pluginUploadService.uploadJar(file, pluginName, pluginId, pluginPhase, scope, config, remark);
    }

    @PostMapping("/validate-groovy")
    @RateLimit(limit = 30, window = "1m", scope = "ip")
    public Map<String, Object> validateGroovy(@RequestBody ValidateGroovyRequest request) {
        return pluginUploadService.validateGroovy(request.scriptContent());
    }

    public record PluginCreateRequest(
            String pluginName,
            String pluginId,
            String pluginType,
            String pluginPhase,
            String scope,
            Integer sortOrder,
            String config,
            String remark,
            List<Long> groupMemberIds,
            String scriptContent
    ) {}

    public record PluginUpdateRequest(
            String pluginName,
            String config,
            Integer sortOrder,
            String remark,
            String scriptContent
    ) {}

    public record GlobalSortRequest(
            String pluginPhase,
            List<Long> pluginIds
    ) {}

    public record ValidateConfigRequest(
            String pluginId,
            String config
    ) {}

    public record ValidateGroovyRequest(
            String scriptContent
    ) {}
}
