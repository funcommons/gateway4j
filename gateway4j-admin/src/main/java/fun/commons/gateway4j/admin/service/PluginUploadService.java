package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.admin.mapper.PluginJarMapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.PluginJar;
import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.MultipleCompilationErrorsException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

@Service
public class PluginUploadService {

    private static final long MAX_JAR_SIZE = 50L * 1024 * 1024;

    private final PluginService pluginService;
    private final PluginJarMapper pluginJarMapper;

    @Value("${gateway4j.plugin.jar-dir:./plugins}")
    private String jarDir;

    public PluginUploadService(PluginService pluginService, PluginJarMapper pluginJarMapper) {
        this.pluginService = pluginService;
        this.pluginJarMapper = pluginJarMapper;
    }

    @Transactional
    public Plugin uploadJar(MultipartFile file, String pluginName, String pluginId,
                            String pluginPhase, String scope, String config, String remark) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "JAR 文件不能为空");
        }
        if (file.getSize() > MAX_JAR_SIZE) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "JAR 文件大小不可超过 50MB");
        }
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        if (!originalName.endsWith(".jar")) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "仅支持 .jar 文件");
        }
        String jarMd5;
        String mainClass;
        try {
            byte[] bytes = file.getBytes();
            jarMd5 = md5(bytes);
            mainClass = detectMainClass(bytes);
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.PLUGIN_LOAD_FAILED, "读取 JAR 失败: " + e.getMessage());
        }
        if (mainClass == null) {
            throw new BusinessException(ErrorCode.PLUGIN_LOAD_FAILED,
                    "JAR 中未找到实现 GatewayPlugin 接口的类");
        }

        Path targetDir = Path.of(jarDir);
        try {
            Files.createDirectories(targetDir);
            Path target = targetDir.resolve(pluginId + "-" + jarMd5.substring(0, 8) + ".jar");
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            Plugin plugin = Plugin.builder()
                    .pluginName(pluginName)
                    .pluginId(pluginId)
                    .pluginType("JAR")
                    .pluginPhase(pluginPhase)
                    .scope(scope != null ? scope : "ROUTE")
                    .config(config != null ? config : "{}")
                    .remark(remark)
                    .build();
            pluginService.createPlugin(plugin, null, null);

            PluginJar jar = PluginJar.builder()
                    .pluginId(plugin.getId())
                    .jarPath(target.toAbsolutePath().toString())
                    .jarMd5(jarMd5)
                    .mainClass(mainClass)
                    .build();
            pluginJarMapper.insert(jar);
            return plugin;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.PLUGIN_LOAD_FAILED, "保存 JAR 失败: " + e.getMessage());
        }
    }

    public Map<String, Object> validateGroovy(String scriptContent) {
        if (scriptContent == null || scriptContent.isBlank()) {
            return Map.of("is_valid", false, "error_line", 0, "error_message", "脚本内容不能为空");
        }
        try {
            new GroovyShell().parse(scriptContent);
            return Map.of("is_valid", true, "error_line", 0, "error_message", "");
        } catch (MultipleCompilationErrorsException e) {
            int line = extractErrorLine(e);
            return Map.of("is_valid", false, "error_line", line,
                    "error_message", e.getMessage() != null ? e.getMessage() : "编译失败");
        } catch (Exception e) {
            return Map.of("is_valid", false, "error_line", 0,
                    "error_message", e.getMessage() != null ? e.getMessage() : "编译失败");
        }
    }

    private String md5(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.PLUGIN_LOAD_FAILED, "MD5 计算失败");
        }
    }

    private int extractErrorLine(MultipleCompilationErrorsException e) {
        try {
            var messages = e.getErrorCollector().getErrors();
            if (messages != null && !messages.isEmpty()) {
                Object first = messages.get(0);
                if (first instanceof org.codehaus.groovy.control.messages.SyntaxErrorMessage sem) {
                    return sem.getCause().getStartLine();
                }
            }
        } catch (Exception ignored) {
            // fall through to default
        }
        return 0;
    }

    private String detectMainClass(byte[] jarBytes) throws IOException {
        Path temp = Files.createTempFile("plugin", ".jar");
        try {
            Files.write(temp, jarBytes);
            try (JarFile jarFile = new JarFile(temp.toFile())) {
                List<String> classNames = jarFile.stream()
                        .map(JarEntry::getName)
                        .filter(n -> n.endsWith(".class") && !n.contains("$"))
                        .map(n -> n.replace('/', '.').substring(0, n.length() - 6))
                        .toList();
                for (String className : classNames) {
                    if (implementsGatewayPlugin(temp, className)) {
                        return className;
                    }
                }
            }
            return null;
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private boolean implementsGatewayPlugin(Path jarPath, String className) {
        try (java.net.URLClassLoader loader = new java.net.URLClassLoader(
                new java.net.URL[]{jarPath.toUri().toURL()},
                this.getClass().getClassLoader())) {
            Class<?> clazz = Class.forName(className, false, loader);
            return fun.commons.gateway4j.plugin.api.GatewayPlugin.class.isAssignableFrom(clazz)
                    && !clazz.isInterface() && !java.lang.reflect.Modifier.isAbstract(clazz.getModifiers());
        } catch (Throwable e) {
            return false;
        }
    }
}
