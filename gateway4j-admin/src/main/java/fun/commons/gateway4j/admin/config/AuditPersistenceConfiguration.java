package fun.commons.gateway4j.admin.config;

import fun.commons.framework4j.audit.config.AuditProperties;
import fun.commons.framework4j.audit.service.AuditSink;
import fun.commons.framework4j.audit.service.InMemoryAuditSink;
import fun.commons.framework4j.audit.service.JdbcAuditSink;
import fun.commons.framework4j.datasource.manager.MultiDataSourceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 审计落库（P1-4）：显式装配 {@link JdbcAuditSink}，覆盖框架的内存兜底。
 *
 * <p><b>为什么需要这个类</b>：framework4j-audit 的自动装配条件是「Spring 上下文存在
 * {@code javax.sql.DataSource} Bean」时才注册 JdbcAuditSink，否则回落
 * {@code InMemoryAuditSink}（重启即丢）。gateway4j 的数据源由 framework4j
 * {@code MultiDataSourceManager} 托管（admin-boot 排除了
 * {@code DataSourceAutoConfiguration}），上下文里没有裸 DataSource Bean——
 * 条件永远不成立，此前审计一直在内存态运行（启动日志
 * 「未检测到 DataSource — fallback 到 InMemoryAuditSink」即此问题）。</p>
 *
 * <p>本配置从 {@link MultiDataSourceManager#getDefaultDataSource()} 取真实数据源
 * 构造 JdbcAuditSink；表结构由 {@code V1.4.0__audit_log.sql} 建立，列名与框架
 * INSERT 列序逐字对齐。配套 {@link AuditStartupProbe} 在启动时对表做一次
 * INSERT+DELETE 自检，失败以 ERROR 级日志显性化（不阻断启动）。</p>
 */
@Configuration
public class AuditPersistenceConfiguration {

    private static final Logger log = LoggerFactory.getLogger(AuditPersistenceConfiguration.class);

    @Bean
    public AuditSink auditSink(ObjectProvider<MultiDataSourceManager> dataSourceManagers,
                               AuditProperties auditProperties) {
        MultiDataSourceManager manager = dataSourceManagers.getIfAvailable();
        if (manager == null) {
            // 仅单测等无数据源场景：回落内存实现并显性提示（生产 admin-boot 必有数据源）
            log.warn("[Audit] MultiDataSourceManager 未装配，审计回落 InMemoryAuditSink（仅开发/单测用）");
            return new InMemoryAuditSink();
        }
        log.info("[Audit] 审计落库启用：JdbcAuditSink（表={}）", auditProperties.getTableName());
        return new JdbcAuditSink(manager.getDefaultDataSource(), auditProperties);
    }

    @Bean
    public AuditStartupProbe auditStartupProbe(ObjectProvider<MultiDataSourceManager> dataSourceManagers,
                                               AuditProperties auditProperties) {
        MultiDataSourceManager manager = dataSourceManagers.getIfAvailable();
        return new AuditStartupProbe(manager == null ? null : manager.getDefaultDataSource(),
                auditProperties.getTableName());
    }

    /**
     * 启动自检探针：对 audit_log 做一次 INSERT + DELETE（不走 AuditSink，避免污染
     * Hash Chain——探针行落库后立即删除，链校验无痕迹）。表缺失/库不可写等失败
     * 一律 ERROR 显性化，但不阻断启动（审计降级为失败告警，主流程不因审计中断）。
     */
    public static class AuditStartupProbe implements ApplicationRunner {

        /** 探针 action 标记（与业务 @Auditable action 命名空间隔离，便于排查残留）。 */
        public static final String PROBE_ACTION = "AUDIT_STARTUP_PROBE";

        private final JdbcTemplate jdbcTemplate;

        public AuditStartupProbe(javax.sql.DataSource dataSource, String tableName) {
            this.jdbcTemplate = dataSource == null ? null : new JdbcTemplate(dataSource);
            this.tableName = tableName;
        }

        /** 单测注入点：直接给 mock 的 JdbcTemplate。 */
        AuditStartupProbe(JdbcTemplate jdbcTemplate, String tableName) {
            this.jdbcTemplate = jdbcTemplate;
            this.tableName = tableName;
        }

        private final String tableName;

        @Override
        public void run(ApplicationArguments args) {
            probe();
        }

        /** 执行探针。@return true = 表可写；false = 失败（已记 ERROR）。 */
        public boolean probe() {
            if (jdbcTemplate == null) {
                log.error("[审计自检] 数据源未装配，audit_log 表自检跳过——审计当前不可落库！");
                return false;
            }
            try {
                jdbcTemplate.update(
                        "INSERT INTO " + tableName
                                + " (action, target_type, actor, result, trace_id, \"timestamp\", hash) "
                                + "VALUES (?, 'AUDIT_LOG', 'system', 'PROBE', 'startup-probe', NOW(), 'startup-probe')",
                        PROBE_ACTION);
                int removed = jdbcTemplate.update(
                        "DELETE FROM " + tableName + " WHERE action = ? AND trace_id = 'startup-probe'",
                        PROBE_ACTION);
                log.info("[审计自检] audit_log 表可写（探针写入并清理 {} 行）——审计落库就绪", removed);
                return true;
            } catch (Exception e) {
                log.error("[审计自检] audit_log 表写入失败——审计无法落库（检查 V1.4.0 迁移是否执行/库权限）: {}",
                        e.getMessage(), e);
                return false;
            }
        }
    }
}
