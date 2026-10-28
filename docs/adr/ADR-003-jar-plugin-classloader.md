# ADR-003：JAR 插件使用独立 ClassLoader

## 状态

已采纳

## 背景

JAR 插件由用户上传，需在网关运行时动态加载和执行。候选方案：

1. **独立 URLClassLoader**：每个 JAR 插件使用独立 ClassLoader，父类加载器仅加载 plugin-api + common
2. **Spring Bean 注册**：将 JAR 插件直接注册为 Spring Bean，共享应用 ClassLoader
3. **OSGi 容器**：使用 OSGi 框架管理插件生命周期，隔离性最强但复杂度极高

## 决策

采用独立 URLClassLoader 方案。

## 理由

- **依赖隔离**：不同 JAR 插件可能依赖不同版本的同一库，独立 ClassLoader 避免依赖冲突
- **安全隔离**：限制插件可见的类范围，防止恶意代码访问网关引擎内部类
- **热卸载**：插件卸载时关闭 ClassLoader，释放类和资源，避免内存泄漏
- **实现适中**：比 OSGi 简单得多，比共享 ClassLoader 安全得多

## 后果

- **正面**：依赖隔离、安全隔离、支持热卸载
- **负面**：Classloader 隔离导致插件间不可直接引用，需通过 ServerWebExchange attributes 传递数据；Classloader 泄漏风险（未关闭的线程、注册的 ShutdownHook 等）
- **风险**：JAR 插件若启动后台线程或注册 Hook，卸载时 ClassLoader 无法回收，导致 Metaspace 内存泄漏
- **缓解**：插件 SDK 提供 `onDestroy()` 回调，要求插件清理资源；沙箱限制 `Thread`/`Runtime` 访问；监控 Metaspace 使用率，超阈值告警
